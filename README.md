![Moleculer logo](http://moleculer.services/images/banner.png)

[![NPM version](https://img.shields.io/npm/v/@1xtr/moleculer-cloudwatch-logger.svg)](https://www.npmjs.com/package/@1xtr/moleculer-cloudwatch-logger) ![NPM Downloads](https://img.shields.io/npm/dw/@1xtr/moleculer-cloudwatch-logger)

## Send logs to AWS CloudWatch

This is a fork
from [native Datadog logger](https://github.com/moleculerjs/moleculer/blob/e62016ea16c5c4e303738a66e3a7429237ea9042/src/loggers/datadog.js)

### Description

Easy to send logs directly to AWS CloudWatch

### Install

```bash
$ npm install @1xtr/moleculer-cloudwatch-logger --save
```
### Import

```js
// ES5 example
const CloudWatchLogger = require('@1xtr/moleculer-cloudwatch-logger');

// ES6+ example
import { CloudWatchLogger } from '@1xtr/moleculer-cloudwatch-logger';
```

### Usage

```js
module.exports = {
  logger: new CloudWatchLogger({
    // put here your options
  })
}
```

### Default options


```js
const defaultOptions = {
  clientOptions: {},
  source: process.env.MOL_NODE_NAME || 'moleculer',
  hostname: hostname(),
  objectPrinter: null,
  interval: 5 * 1000,
  excludeModules: [],
  logGroupName: `mol-${process.env.MOL_NODE_NAME || hostname()}`,
}
```

### Options example

```json
{
  "clientOptions": {
    "region": "us-east-1"
  },
  "excludeModules": [
    "broker",
    "registry",
    "discovery",
    "transporter",
    "$node",
    "transit",
    "cacher"
  ]
}
```
