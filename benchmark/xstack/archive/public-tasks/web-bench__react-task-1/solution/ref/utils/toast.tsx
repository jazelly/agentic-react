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

import React, { useState, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client' // React 19 port: legacy ReactDOM.render/unmountComponentAtNode were removed

interface ToastProps {
  message: string
  duration?: number
  style?: React.CSSProperties
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, duration = 2000, style, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div
      style={{
        backgroundColor: 'green',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        position: 'fixed',
        zIndex: 9999,
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        textWrap: 'nowrap',
        fontSize: 12,
        ...style,
      }}
    >
      {message}
    </div>
  )
}

let toastContainer: HTMLDivElement | null = null
let toastRoot: Root | null = null

export const showToast = (message: string, duration?: number, style?: React.CSSProperties) => {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    document.body.appendChild(toastContainer)
  }
  if (!toastRoot) toastRoot = createRoot(toastContainer)

  const toastId = Date.now()

  const handleClose = () => {
    if (toastContainer) {
      toastRoot?.unmount()
      toastRoot = null
    }
  }

  toastRoot.render(
    <div
      style={{
        position: 'fixed',
        top: `10px`,
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <Toast
        key={toastId}
        message={message}
        duration={duration}
        style={style}
        onClose={handleClose}
      />
    </div>
  )
}
