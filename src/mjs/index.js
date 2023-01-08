/*
 * moleculer
 * Copyright (c) 2023 MoleculerJS (https://github.com/moleculerjs/moleculer)
 * MIT Licensed
 */

/**
 * @typedef {Object} CloudWatchLoggerOptions
 * @property {import('@aws-sdk/client-cloudwatch-logs').CloudWatchLogsClientConfig} clientOptions CloudWatchLogs client options
 * @property {string} [source='moleculer'] Default is process.env.MOL_NODE_NAME if set or 'moleculer'
 * @property {string} [hostname='hostname'] Hostname, default is machine hostname 'os.hostname()'
 * @property {Function} [objectPrinter=null] Callback function for object printer, default is 'JSON.stringify'
 * @property {number} [interval=5000] Date uploading interval in milliseconds, default is 10000
 * @property {string[]} [excludeModules=[]] Exclude modules from logs, 'broker', 'registry' etc.
 * @property {string} [logGroupName='mol'] logGroupName, `mol-${process.env.MOL_NODE_NAME || hostname()}`
 */

import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import dayjs from 'dayjs'
import _ from 'lodash'
import { Loggers } from 'moleculer'
import { hostname } from 'os'

const logTimeFormat = 'YYYY-MM-DD_HH-mm-ss'
const isObject = (o) => o !== null && typeof o === 'object' && !(o instanceof String)

/**
 * CloudWatchLogger logger for Moleculer
 * send logs directly to AWS CloudWatch
 * @class CloudWatchLogger
 * @constructor
 * @extends {Loggers.Base}
 */
export class CloudWatchLogger extends Loggers.Base {
  /**
   * Creates an instance of CloudWatchLogsClient.
   * @param {{}} opts
   */
  constructor(opts = {}) {
    super(opts)
    
    /**
     * @type {CloudWatchLoggerOptions}
     */
    const defaultOptions = {
      clientOptions: {},
      source: process.env.MOL_NODE_NAME || 'moleculer',
      hostname: hostname(),
      objectPrinter: null,
      interval: 5 * 1000,
      excludeModules: [],
      logGroupName: `mol-${process.env.MOL_NODE_NAME || hostname()}`,
    }
    
    this.opts = _.defaultsDeep(this.opts, defaultOptions)
    this.queue = []
    this.timer = null
    this.client = {}
    this.isLogGroupNotExist = true
  }
  
  /**
   * Initialize logger.
   * @param {LoggerFactory} loggerFactory
   */
  async init(loggerFactory) {
    super.init(loggerFactory)
    
    this.objectPrinter = this.opts.objectPrinter
      ? this.opts.objectPrinter
      : (obj) => JSON.stringify(obj)
    
    if (this.opts.interval > 0) {
      this.timer = setInterval(() => this.flush(), this.opts.interval)
      this.timer.unref()
    }
    this.client = new CloudWatchLogsClient(this.opts.clientOptions)
    
    // add log group before
    if (this.isLogGroupNotExist) {
      try {
        await this.createLogGroup(this.opts.logGroupName)
      } catch (e) {
        // console.log({ error: e })
        if (e.name === 'ResourceAlreadyExistsException') {
          this.isLogGroupNotExist = false
          // console.log('this.isLogGroupNotExist', this.isLogGroupNotExist)
        }
      }
    }
  }
  
  /**
   * Stopping logger
   * @return {*}
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    return this.flush().then()
  }
  
  /**
   * Generate a new log handler.
   * @param {object} bindings
   */
  getLogHandler(bindings) {
    const level = bindings ? this.getLogLevel(bindings.mod) : null
    if (!level) return null
    
    const printArgs = (args) =>
      args.map((p) => {
        if (isObject(p) || Array.isArray(p)) return this.objectPrinter(p)
        if (typeof p === 'string') return p.trim()
        return p
      })
    const levelIdx = Loggers.Base.LEVELS.indexOf(level)
    
    return (type, args) => {
      const typeIdx = Loggers.Base.LEVELS.indexOf(type)
      if (typeIdx > levelIdx) return
      // allow only `error` and `fatal` from broker
      if (
        this.opts.excludeModules.includes(bindings.mod) &&
        !(bindings.mod === 'broker' && typeIdx <= 1)
      )
        return
      
      this.queue.push({
        ts: Date.now(),
        level: type,
        msg: printArgs(args).join(' '),
        bindings,
      })
      if (!this.opts.interval) this.flush().then()
    }
  }
  
  /**
   * Flush queued log entries to CloudWatchLogger.
   */
  async flush() {
    if (this.queue.length > 0) {
      const rows = Array.from(this.queue)
      this.queue.length = 0
      
      /**
       * @type {import('@aws-sdk/client-cloudwatch-logs').InputLogEvent[]}
       */
      const data = rows.map((row) => {
        const timestamp = row.ts
        const message = {
          timestamp,
          level: row.level,
          message: row.msg,
          nodeID: row.bindings.nodeID,
          namespace: row.bindings.ns,
          service: row.bindings.svc,
          version: row.bindings.ver,
          
          source: this.opts.source,
          tags: [process.env.NODE_ENV],
          hostname: this.opts.hostname,
        }
        return {
          timestamp,
          message: JSON.stringify(message),
        }
      })
      
      /**
       * @type {import('@aws-sdk/client-cloudwatch-logs').CreateLogStreamCommandInput}
       */
      const logStreamOptions = {
        logGroupName: this.opts.logGroupName,
        logStreamName: dayjs().format(logTimeFormat),
      }
      
      try {
        await this.client.send(new CreateLogStreamCommand(logStreamOptions))
      } catch (e) {
        console.log('Error CreateLogStreamCommand', e)
      }
      
      /**
       * @type {import('@aws-sdk/client-cloudwatch-logs').PutLogEventsCommandInput}
       */
      const eventOptions = {
        ...logStreamOptions,
        logEvents: data,
      }
      
      const PutEventCommand = new PutLogEventsCommand(eventOptions)
      // const putEventRes = await this.client.send(PutEventCommand)
      // return this.client.send(PutEventCommand)
      return this.client
        .send(PutEventCommand)
        .then((res) => {
          console.log({ result: res })
          if (res.errors) {
            // eslint-disable-next-line no-console
            console.info(`Logs are uploaded to AWS CloudWatch, but has errors: ${res.errors}`)
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`Unable to upload logs to AWS CloudWatch. Error:${err.message}`, err)
        })
    }
    
    return this.broker.Promise.resolve()
  }
  
  createLogGroup(groupName) {
    /**
     * @type {import('@aws-sdk/client-cloudwatch-logs').CreateLogGroupCommandInput}
     */
    const cmdOpt = {
      logGroupName: groupName,
    }
    const command = new CreateLogGroupCommand(cmdOpt)
    return this.client.send(command)
  }
}
