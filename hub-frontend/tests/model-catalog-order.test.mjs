import './helpers/chinese-locale.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { createComponentHarness } from './helpers/react-harness.mjs'

const Runtime = () => null
const provider = (id, name, builtin, enabled = true) => ({ id, name, builtin, enabled, revision: 'fixture' })
const initial = [provider('builtin-a', 'A builtin', true), provider('custom-z', 'Z custom', false),
  provider('builtin-off', 'A disabled', true, false), provider('custom-a', 'A custom', false),
  provider('custom-off', 'Z disabled', false, false)]

async function mount(t, catalog) {
  const page = await createComponentHarness(new URL('../src/screens/ModelCatalog.jsx', import.meta.url), {
    dependencies: {
      '../api.js': { api: { modelCatalog: async () => structuredClone(catalog) } },
      '../ui.jsx': { Modal: () => null, SelectMenu: () => null, Confirm: () => null,
        Icon: () => null, Loading: () => null, ErrorState: () => null, toast() {} },
      './LlmSettings.jsx': { __esModule: true, default: () => null }, './ModelRuntime.jsx': { __esModule: true, default: Runtime },
      './model-catalog-actions.css': {}, './model-capabilities.css': {},
      './ModelCapabilities.jsx': { CAPABILITY_LABELS: {}, CAPABILITY_STATES: {}, CapabilityBadges() {}, ModelCapabilityStatus() {} },
    },
  })
  t.after(() => page.unmount())
  page.render(); await page.flush()
  return page
}
const order = page => page.nodes(node => node.type === 'article').map(node => node.key)

test('custom services stay first within enabled groups on initial load and remount, without changing server order', async t => {
  const catalog = { providers: structuredClone(initial), models: [] }
  const expected = ['custom-a', 'custom-z', 'builtin-a', 'custom-off', 'builtin-off']
  assert.deepEqual(order(await mount(t, catalog)), expected)
  catalog.providers.reverse()
  assert.deepEqual(order(await mount(t, catalog)), expected)
  assert.deepEqual(catalog.providers, initial.toReversed())
})

test('new service is revealed immediately and remains ahead of built-ins after reopening', async t => {
  const catalog = { providers: structuredClone(initial), models: [] }
  const page = await mount(t, catalog)
  const actions = page.nodes(node => node.type === Runtime)[0].props.catalogActions
  const add = React.Children.toArray(actions.props.children).find(node => node.props.className === 'btn btn-primary')
  page.act(() => add.props.onClick())
  catalog.providers.push(provider('custom-new', 'ZZ new service', false))
  const form = page.nodes(node => node.type?.name === 'ProviderForm')[0]
  page.act(() => form.props.onSaved('custom-new'))
  await page.flush()
  assert.equal(order(page)[0], 'custom-new')
  const reopened = order(await mount(t, catalog))
  assert.ok(reopened.indexOf('custom-new') < reopened.indexOf('builtin-a'))
  assert.deepEqual(reopened, ['custom-a', 'custom-z', 'custom-new', 'builtin-a', 'custom-off', 'builtin-off'])
})
