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

/**
 * @param {string} color
 * @returns
 */
function parseColorToHex(color) {
  // Check if it is HEX format
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  // Check if it is RGB format
  const rgbRegex = /^rgb\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*\)$/
  // Check if it is RGBA format
  const rgbaRegex =
    /^rgba\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*([01]?\.\d+|[01])\s*\)$/

  if (hexRegex.test(color)) {
    // If it is HEX format, return directly
    return color.toLowerCase()
  } else if (rgbRegex.test(color)) {
    // If it is RGB format, convert to HEX
    const rgbValues = color.match(rgbRegex).slice(1, 4)
    const hexValues = rgbValues.map((value) => {
      const num = value.includes('%') ? Math.round(parseInt(value, 10) * 2.55) : parseInt(value, 10)
      return num.toString(16).padStart(2, '0')
    })
    return `#${hexValues.join('')}`
  } else if (rgbaRegex.test(color)) {
    // If it is RGBA format, convert to HEX (ignore transparency)
    const rgbaValues = color.match(rgbaRegex).slice(1, 4)
    const hexValues = rgbaValues.map((value) => {
      const num = value.includes('%') ? Math.round(parseInt(value, 10) * 2.55) : parseInt(value, 10)
      return num.toString(16).padStart(2, '0')
    })
    return `#${hexValues.join('')}`
  } else {
    // If it is not in the above format, return null or throw an error
    return null
  }
}

module.exports = {
  parseColorToHex,
}
