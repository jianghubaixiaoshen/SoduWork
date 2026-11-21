"""Authorized business instructions, independent of frozen delivery evidence."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import timezone

from fastapi import HTTPException
from sqlalchemy import select

from .. import models
from . import dispatch_instructions, task_access, task_requirements

DEFINITION = "requirement.definition"


def definition(task):
    content = {key: str(value or "") for key, value in task_requirements.public_content(task).items()}
    content["acceptanceCriteria"] = [str(value.get("label") or value.get("name") or "")
        if isinstance(value, dict) else str(value or "") for value in (task.acceptance_criteria or [])]
    return content


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False,
        sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


async def _definitions(session, task_id):
    return (await session.scalars(select(models.TaskEvent).where(
        models.TaskEvent.task_id == task_id, models.TaskEvent.kind == DEFINITION,
    ).order_by(models.TaskEvent.at.desc(), models.TaskEvent.id.desc()))).all()


def _matches(event, content, version):
    return (isinstance(event.detail, dict) and event.detail.get("schemaVersion") == 1 and
            event.detail.get("requirementVersion") == version and
            event.detail.get("contentHash") == _hash(content) and event.detail.get("content") == content)


def _definition_source(event, events):
    source_id = event.detail.get("sourceDefinitionId")
    if not source_id:
        return event
    return next((source for source in events if source.id == source_id and isinstance(source.detail, dict) and
        source.detail.get("schemaVersion") == 1 and
        not source.detail.get("sourceDefinitionId") and source.detail.get("content") == event.detail.get("content") and
        source.detail.get("contentHash") == event.detail.get("contentHash")), None)


async def record_definition(session, task, previous=None, previous_version=None):
    content = definition(task)
    detail = {"schemaVersion": 1, "requirementVersion": int(task.requirement_version or 1),
              "content": content, "contentHash": _hash(content)}
    if previous == content:
        if previous_version is None or previous_version == detail["requirementVersion"]:
            return
        # Writes resolve only this exact prior version; never load its whole history.
        matches = (await session.scalars(select(models.TaskEvent).where(
            models.TaskEvent.task_id == task.id, models.TaskEvent.kind == DEFINITION,
            models.TaskEvent.detail["schemaVersion"].as_integer() == 1,
            models.TaskEvent.detail["requirementVersion"].as_integer() == previous_version,
            models.TaskEvent.detail["contentHash"].as_string() == detail["contentHash"],
        ).limit(2))).all()
        receipt = matches[0] if len(matches) == 1 and _matches(matches[0], content, previous_version) else None
        source = receipt
        if receipt and receipt.detail.get("sourceDefinitionId"):
            source = await session.scalar(select(models.TaskEvent).where(
                models.TaskEvent.id == receipt.detail["sourceDefinitionId"],
                models.TaskEvent.task_id == task.id, models.TaskEvent.kind == DEFINITION,
                models.TaskEvent.detail["schemaVersion"].as_integer() == 1,
                models.TaskEvent.detail["contentHash"].as_string() == detail["contentHash"],
            ).limit(1))
            if (source is not None and (not isinstance(source.detail, dict) or
                    source.detail.get("content") != content or source.detail.get("sourceDefinitionId"))):
                source = None
        if source is None:
            return
        # Metadata/ownership versions carry the proven original edit time, never their own new timestamp.
        detail["sourceDefinitionId"] = source.id
    from . import task_events
    task_events.record(session, task.id, DEFINITION, detail)


def _time(value):
    if value is None:
        return None
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat(timespec="microseconds")


async def packet(session, client, task):
    content = definition(task)
    version = int(task.requirement_version or 1)
    definitions = await _definitions(session, task.id)
    receipt = next((event for event in definitions if _matches(event, content, version)), None)
    known = _definition_source(receipt, definitions) if receipt else None
    rows = [{"id": "requirement:" + task.id + ":" + str(task.requirement_version or 1),
             "kind": "requirement", "at": _time(known.at) if known else None,
             "createdAt": _time(task.created_at),
             "requirementVersion": int(task.requirement_version or 1),
             "text": "\n\n".join([str(content.get(key) or "") for key in ("title", "note")] +
                (["完成标准：\n" + "\n".join(content["acceptanceCriteria"])] if content["acceptanceCriteria"] else [])).strip()}]
    # Review assignments do not grant access to private execution history.
    execution = await task_access.can_view(session, client, task)
    if execution:
        events = (await session.scalars(select(models.TaskEvent).where(
            models.TaskEvent.task_id == task.id,
            models.TaskEvent.kind.in_((dispatch_instructions.KIND, "release.rejected", "artifact.rejected")),
        ).order_by(models.TaskEvent.at, models.TaskEvent.id))).all()
        for event in events:
            detail = event.detail if isinstance(event.detail, dict) else {}
            if event.kind == "release.rejected" and detail.get("action") != "review":
                continue
            text = detail.get("note")
            if not isinstance(text, str) or not text.strip():
                continue
            row = {"id": event.id, "kind": "supplement" if event.kind == dispatch_instructions.KIND else "rework",
                   "at": _time(event.at), "text": text}
            for source, target in (("requestId", "approvalId"), ("versionId", "artifactVersionId")):
                if isinstance(detail.get(source), str) and detail[source]:
                    row[target] = detail[source]
            rows.append(row)
    rows.sort(key=lambda row: (row["at"] is not None, row["at"] or "", row["id"]))
    result = {"schemaVersion": 1, "rows": rows, "executionContextIncluded": bool(execution)}
    # Equal timestamps only have a stable display order, never a stronger authority.
    result["revision"] = _hash(result)
    return result


async def verify(session, client, task, revision):
    if not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9]{64}", revision):
        raise HTTPException(422, "验收要求时序版本无效，请重新发起验收")
    if (await packet(session, client, task))["revision"] != revision:
        raise HTTPException(409, "需求补充说明或退回意见已变化，请重新核验后再提交验收")
