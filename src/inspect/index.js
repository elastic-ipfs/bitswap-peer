'use strict'

const path = require('path')
const fs = require('fs/promises')
const doc = require('@dnlup/doc')
const config = require('../config')

const MB = 1024 * 1024

const inspect = {
  trace: [],
  sampler: null,

  init: () => {
    inspect.sampler = doc({
      collect: {
        cpu: true,
        memory: true
        // TODO event loop delay, event loop utilization, garbage collection
      },
      autoStart: false,
      sampleInterval: 100,
      unref: true
    })

    inspect.sampler.on('sample', () => {
      inspect.trace.push({
        cpu: inspect.sampler.cpu.usage,
        rss: inspect.sampler.memory.rss,
        time: Date.now()
      })
    })
  },

  reset: () => {
    inspect.trace = []
    inspect.metrics.values = {}
    inspect.metrics.trace = []
  },

  start: () => {
    if (!inspect.sampler) {
      inspect.init()
    } else {
      inspect.reset()
    }

    inspect.sampler.start()
  },

  end: () => {
    inspect.sampler.stop()
    return inspect.trace
  },

  chart: async () => {
    const html = await fs.readFile(path.join(__dirname, 'chart-src.html'), 'utf8')

    const data0 = []

    let tCpu = 0
    let tMem = 0
    let n = inspect.trace.length
    const tMinValue = inspect.trace[0].time / 1000
    const tMaxValue = inspect.trace[inspect.trace.length - 1].time / 1000

    for (let i = 0; i < n; i++) {
      const row = inspect.trace[i]

      tCpu += row.cpu
      tMem += row.rss

      data0.push(JSON.stringify([
        (row.time - tMinValue) / 1000, // time > x axis
        row.cpu / 100, // cpu
        (row.rss) / MB // memory
      ]))
    }

    const avg = [
      'avg cpu: ' + (tCpu / n).toFixed(3) + ' %',
      'avg mem: ' + (tMem / n / MB).toFixed(3) + ' MB'
    ]

    // custom metrics
    const data1 = []
    if (inspect.metrics.trace.lenght > 0) {
      n = inspect.metrics.trace.length

      for (let i = 0; i < n; i++) {
        const row = inspect.metrics.trace[i]

        data0.push(JSON.stringify([
          (row.time - tMinValue) / 1000, // time > x axis
          Math.random(), // TODO connections
          Math.random(), // TODO requested pack
          Math.random() // TODO requested entries
        ]))
      }
    }

    return html
      .replace('//{data0}',
        'data0.addRows([' +
        data0.join(',\n') +
        '])')
      .replace('//{data1}',
        'data1.addRows([' +
        data1.join(',\n') +
        '])')
      .replaceAll('//{tMinValue}', tMinValue)
      .replaceAll('//{tMaxValue}', tMaxValue)
      .replace('//{avg}', avg.join('\n'))
  },

  // very basic metrics trace

  metrics: {
    values: {},
    trace: [],

    _track: (key) => {
      inspect.metrics.trace.push({
        [key]: inspect.metrics.values[key],
        time: Date.now()
      })
    },

    add: (key) => {
      inspect.metrics.values[key] = 0
      inspect.metrics._track(key)
    },

    increase: (key) => {
      inspect.metrics.values[key]++
      inspect.metrics._track(key)
    },

    decrease: (key) => {
      inspect.metrics.values[key]--
      inspect.metrics._track(key)
    },

    set: (key, value) => {
      inspect.metrics.values[key] = value
      inspect.metrics._track(key)
    }
  }
}

if (!config.allowInspection) {
  function noop() { }
  inspect.init = noop
  inspect.reset = noop
  inspect.start = noop
  inspect.end = noop
  inspect.chart = noop
  inspect.metrics._track = noop
  inspect.metrics.add = noop
  inspect.metrics.increase = noop
  inspect.metrics.decrease = noop
  inspect.metrics.set = noop
}

module.exports = inspect
