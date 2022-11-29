
import path from 'path'
import fs from 'fs/promises'
import doc from '@dnlup/doc'
import { dirname } from 'e-ipfs-core-lib'
import config from '../config.js'

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

  stop: () => {
    inspect.sampler.stop()
    return inspect.trace
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

    increase: (key, value = 1) => {
      inspect.metrics.values[key]
        ? inspect.metrics.values[key] += value
        : inspect.metrics.values[key] = value
      inspect.metrics._track(key)
    },

    decrease: (key, value = 1) => {
      inspect.metrics.values[key]
        ? inspect.metrics.values[key] -= value
        : inspect.metrics.values[key] = -1 * value
      inspect.metrics._track(key)
    },

    set: (key, value) => {
      inspect.metrics.values[key] = value
      inspect.metrics._track(key)
    }
  },

  chart: async () => {
    if (inspect.trace.length < 1) {
      return 'no trace'
    }

    const html = await fs.readFile(path.join(dirname(import.meta.url), 'chart-src.html'), 'utf8')

    const data0 = []

    let tCpu = 0
    let tMem = 0
    let n = inspect.trace.length
    const tMinValue = inspect.trace[0].time
    const tMaxValue = inspect.trace[inspect.trace.length - 1].time

    for (let i = 0; i < n; i++) {
      const row = inspect.trace[i]

      tCpu += row.cpu
      tMem += row.rss

      data0.push(JSON.stringify([
        row.time / 1000, // time > x axis
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
    const data2 = []
    const data3 = []
    if (inspect.metrics.trace.length > 0) {
      n = inspect.metrics.trace.length

      for (let i = 0; i < n; i++) {
        const row = inspect.metrics.trace[i]
        if (row.connections) {
          data1.push(JSON.stringify([
            row.time / 1000, // time > x axis
            row.connections
          ]))
        }
        if (row.requests) {
          data2.push(JSON.stringify([
            row.time / 1000, // time > x axis
            row.requests
          ]))
        }
        if (row.blocks) {
          data3.push(JSON.stringify([
            row.time / 1000, // time > x axis
            row.blocks
          ]))
        }
      }
    }

    return html
      .replace('//{data0}', 'data0.addRows([' + data0.join(',\n') + '])')
      .replace('//{data1}', 'data1.addRows([' + data1.join(',\n') + '])')
      .replace('//{data2}', 'data2.addRows([' + data2.join(',\n') + '])')
      .replace('//{data3}', 'data3.addRows([' + data3.join(',\n') + '])')
      .replaceAll('//{tMinValue}', tMinValue / 1000)
      .replaceAll('//{tMaxValue}', tMaxValue / 1000)
      .replace('//{avg}', avg.join('\n'))
  }
}

if (!config.allowInspection) {
  inspect.init =
    inspect.reset =
    inspect.start =
    inspect.stop =
    inspect.chart =
    inspect.metrics._track =
    inspect.metrics.increase =
    inspect.metrics.decrease =
    inspect.metrics.set = function noop () { }
}

export default inspect
