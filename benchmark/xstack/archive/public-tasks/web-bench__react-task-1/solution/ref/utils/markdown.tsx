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

import React from 'react'

export const renderMarkdown = (text: string) => {
  const lines = text.split('\n')
  return lines.map((line, index) => {
    if (line.startsWith('# ')) {
      return <h1 key={index}>{line.slice(2)}</h1>
    } else if (line.startsWith('## ')) {
      return <h2 key={index}>{line.slice(3)}</h2>
    } else if (line.startsWith('### ')) {
      return <h3 key={index}>{line.slice(4)}</h3>
    } else if (line.startsWith('- ')) {
      return <li key={index}>{line.slice(2)}</li>
    } else if (line.match(/\*\*.+\*\*/)) {
      return <p key={index} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
    } else if (line.match(/\*.+\*/)) {
      return <p key={index} dangerouslySetInnerHTML={{ __html: line.replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
    } else {
      return <p key={index}>{line}</p>
    }
  })
}

export const sanitizeHTML = (html: string) => {
  const div = document.createElement('div')
  div.textContent = html
  return div.innerHTML
}