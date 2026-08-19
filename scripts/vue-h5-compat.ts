// The pinned uni-app compiler imports this internal Vue flag, while the
// public Vue 3.4 runtime does not export it from the bundler entry.
// H5 runs in client mode here, so false is the correct runtime value.
export * from '../node_modules/vue/dist/vue.runtime.esm-bundler.js'
export { default } from '../node_modules/vue/dist/vue.runtime.esm-bundler.js'
export const isInSSRComponentSetup = false

// uni-app uses Vue's internal lifecycle injector, which is not part of the
// public Vue 3.4 bundler exports. Preserve Vue's instance hook contract.
export function injectHook(type: string, hook: Function, target: any = undefined, prepend = false) {
  if (!target) return
  const hooks = target[type] || (target[type] = [])
  if (prepend) hooks.unshift(hook)
  else hooks.push(hook)
  return hook
}
