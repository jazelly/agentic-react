// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const { expect } = require('@playwright/test')
const fs = require('fs')
const os = require('os')
const path = require('path')
const cssUtils = require('./css')

/**
 * @param {number[]} items
 */
async function expectArrayItemsEqual(items, numDigits = 5) {
  // console.log('[expectArrayItemsEqual]', items)
  for (let i = 0; i < items.length - 1; i++) {
    expect(items[i]).toBeCloseTo(items[i + 1], numDigits)
  }
}

/**
 * @param {number} actual
 * @param {number} expectLower
 * @param {number} expectUpper
 */
async function expectBetween(actual, expectLower, expectUpper) {
  expect(actual).toBeGreaterThanOrEqual(expectLower)
  expect(actual).toBeLessThanOrEqual(expectUpper)
}

/**
 * @param {number} actual
 * @param {number} expectValue
 * @param {number} tolerancePercent 5 means 5%
 */
async function expectTolerance(actual, expectValue, tolerancePercent = 5) {
  const lower = expectValue * (1 - tolerancePercent / 100)
  const upper = expectValue * (1 + tolerancePercent / 100)
  expectBetween(actual, lower, upper)
}

/**
 * @param {import('@playwright/test').Page}  page
 * @param {string} selector
 */
async function expectOneLine(page, selector) {
  const isTextClipped = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      console.log(el.scrollHeight, el.clientHeight)

      return el.scrollHeight > el.clientHeight
    })
  expect(isTextClipped).toBeFalsy()
}

/**
 * @param {import('@playwright/test').Page}  page
 * @param {string} selector
 * }
 */
async function getComputedStyle(page, selector) {
  return getComputedStyleByLocator(page.locator(selector).first())
}

/**
 * @param {import('@playwright/test').Locator}  locator
 */
async function getComputedStyleByLocator(locator) {
  return locator.evaluate((el) => window.getComputedStyle(el))
}

/**
 * @param {import('@playwright/test').Page}  page
 * @param {string} selector
 */
async function getHtmlElement(page, selector) {
  return page.locator(selector).evaluate((el) => el)
}

/**
 * @param {import('@playwright/test').Page}  page
 * @param {string} selector
 * }
 */
async function getOffset(page, selector) {
  return getOffsetByLocator(page.locator(selector).first())
}

/**
 * @param {import('@playwright/test').Locator} locator
 */
async function getOffsetByLocator(locator) {
  return locator.evaluate((el) => {
    /**
     * @param {HTMLElement | SVGElement} el
     * @see https://stackoverflow.com/a/28222246/1835843
     */
    function _getOffset(el) {
      const rect = el.getBoundingClientRect()
      const left = rect.left + window.scrollX
      const top = rect.top + window.scrollY
      const width = rect.width
      const height = rect.height

      return {
        left,
        top,
        width,
        height,
        centerX: left + width / 2,
        centerY: top + height / 2,
        right: left + width,
        bottom: top + height,
      }
    }

    return _getOffset(el)
  })
}

/**
 * @param {import('@playwright/test').Page}  page
 */
async function getViewport(page) {
  return page
    .locator('html')
    .first()
    .evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }))
}

/**
 * Box Model
 * @param {CSSStyleDeclaration} style
 */
function getBox(style) {
  const height =
    style.boxSizing === 'content-box'
      ? parseFloat(style.height) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth)
      : parseFloat(style.height)

  const width =
    style.boxSizing === 'content-box'
      ? parseFloat(style.width) +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth)
      : parseFloat(style.width)

  return { width, height }
}

/**
 * Box Model
 * @param {import('@playwright/test').Locator} locator
 */
async function getBoxByLocator(locator) {
  const style = await getComputedStyleByLocator(locator)
  return getBox(style)
}

/**
 * Box Model
 * @param {import('@playwright/test').Locator} locator
 */
async function getContentBoxByLocator(locator) {
  const style = await getComputedStyleByLocator(locator)
  const height =
    style.boxSizing === 'content-box'
      ? parseFloat(style.height)
      : parseFloat(style.height) -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom) -
        parseFloat(style.borderTopWidth) -
        parseFloat(style.borderBottomWidth)

  const width =
    style.boxSizing === 'content-box'
      ? parseFloat(style.width)
      : parseFloat(style.width) -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth)

  return { width, height }
}

/**
 * Box Model with margin
 * @param {CSSStyleDeclaration} style
 */
function getMarginBox(style) {
  const box = getBox(style)
  return {
    width: box.width + parseFloat(style.marginLeft) + parseFloat(style.marginRight),
    height: box.height + parseFloat(style.marginTop) + parseFloat(style.marginBottom),
  }
}

/**
 * Box Model with margin
 * @param {import('@playwright/test').Locator} locator
 */
async function getMarginBoxByLocator(locator) {
  const style = await getComputedStyleByLocator(locator)
  return getMarginBox(style)
}

/**
 * @param {string} filePath e.g. f/file.js
 * @param {string} srcPath e.g. /path/to/src
 */
function isExisted(filePath, srcPath) {
  // EVAL_WORKSPACE_ROOT
  const root = process.env['EVAL_PROJECT_ROOT'] || srcPath
  return fs.existsSync(path.join(root, filePath))
  // try {
  //   await fs.access(path.join(root, filePath), fs.constants.F_OK, () => {})
  //   return true
  // } catch (error) {
  //   return false
  // }
}
/**
 * Get specific key fields under window in the current page context from the browser environment.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} _keys
 */
async function getWindowMirror(page, _keys) {
  if (!_keys) {
    return {}
  }
  const keys = typeof _keys === 'string' ? [_keys] : _keys
  const cb = new Function(`
      return [${keys.map((v) => `"${v}"`).join(',')}].reduce((pre, cur) => {
        return {
          ...pre,
          [cur]: window[cur]
        }
      }, {})
    `)

  // @ts-ignore
  return page.evaluate(cb)
}

/**
 * Get the values object of a specific key under a specific DOM
 * @param {import('@playwright/test').Locator} locator
 * @param {string[]} _keys
 */
async function getDomParams(locator, _keys) {
  if (!_keys) {
    return {}
  }
  const keys = typeof _keys === 'string' ? [_keys] : _keys
  const cb = new Function(
    // @ts-ignore
    ['elm'],
    `
      return [${keys.map((v) => `"${v}"`).join(',')}].reduce((pre, cur) => {
        return {
          ...pre,
          [cur]: elm[cur]
        }
      }, {})
    `
  )

  // @ts-ignore
  return locator.evaluate(cb)
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, ms || 100)
  })
}

function getCmdKey() {
  const isMac = os.platform() === 'darwin'
  return isMac ? 'Meta' : 'Control'
}

function getCmdKeyText() {
  const isMac = os.platform() === 'darwin'
  return isMac ? 'Cmd' : 'Ctrl'
}

module.exports = {
  expectArrayItemsEqual,
  expectBetween,
  expectTolerance,
  expectOneLine,
  getComputedStyle,
  getComputedStyleByLocator,
  getHtmlElement,
  getOffset,
  getOffsetByLocator,
  getBox,
  getBoxByLocator,
  getContentBoxByLocator,
  getMarginBox,
  getMarginBoxByLocator,
  getViewport,
  isExisted,
  getWindowMirror,
  getDomParams,
  sleep,
  getCmdKey,
  getCmdKeyText,
  ...cssUtils,
}
