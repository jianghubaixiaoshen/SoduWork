'use strict';

// Observe only requests from this foreground agent. The SDK supplies the LLM
// context here after prepareRequest, transformContext and message conversion.
function subscribe(session, listener) {
  const agent = session.agent;
  const stream = agent?.streamFunction;
  if (typeof stream !== 'function') return session.subscribe(listener);
  let toolResultId, request;
  function streamRequest(model, context, options) {
    const last = context.messages.at(-1);
    request = null;
    if (!toolResultId || last?.role !== 'toolResult' || last.toolCallId !== toolResultId ||
        model.api !== 'openai-completions') return stream.call(this, model, context, options);
    const current = { confirmed: false, signal: options?.signal };
    request = current;
    const id = toolResultId;
    let firstPayload = true;
    return stream.call(this, model, context, { ...options, async onPayload(...args) {
      // Cache warming may reuse these options later. Only the original
      // request's final extension-transformed payload confirms its phase.
      const foreground = firstPayload;
      firstPayload = false;
      const transformed = await options?.onPayload?.(...args);
      const payload = transformed ?? args[0];
      const tail = Array.isArray(payload?.messages) ? payload.messages.at(-1) : null;
      if (foreground) current.confirmed = tail?.role === 'tool' && tail.tool_call_id === id;
      return transformed;
    } });
  }
  agent.streamFunction = streamRequest;
  const unsubscribe = session.subscribe(event => {
    if (event.type === 'message_end') {
      const message = event.message;
      if (message?.role === 'assistant' && message.stopReason === 'error' && request?.confirmed && !request.signal?.aborted) {
        event = { ...event, afterToolResult: true };
      }
      toolResultId = message?.role === 'toolResult' && !message.isError ? message.toolCallId : null;
      request = null;
    } else if (['agent_start', 'agent_end', 'agent_settled'].includes(event.type)) {
      toolResultId = null;
      request = null;
    }
    listener(event);
  });
  return () => {
    unsubscribe();
    if (agent.streamFunction === streamRequest) agent.streamFunction = stream;
  };
}

module.exports = { subscribe };
