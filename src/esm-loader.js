'use strict'

const modules = {}

async function loadEsmModule(module) {
  if (!modules[module]) {
    const m = await import(module)
    modules[module] = m.default || m
  }
  return modules[module]
}

function loadEsmModules(modules) {
  return Promise.all(modules.map(loadEsmModule))
}

module.exports = { loadEsmModules, loadEsmModule }
