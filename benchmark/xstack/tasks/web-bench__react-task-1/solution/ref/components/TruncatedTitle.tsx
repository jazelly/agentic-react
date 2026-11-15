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

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import Tooltip from './Tooltip'

interface TruncatedTitleProps {
  title: string
  maxWidth?: number
}

const TruncatedTitle: React.FC<TruncatedTitleProps> = ({ title, maxWidth = 300 }) => {
  const [isTruncated, setIsTruncated] = useState(false)
  const titleRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const checkTruncation = () => {
      if (titleRef.current) {
        setIsTruncated(titleRef.current.scrollWidth > titleRef.current.clientWidth)
      }
    }

    checkTruncation()

    window.addEventListener('resize', checkTruncation)

    return () => {
      window.removeEventListener('resize', checkTruncation)
    }
  }, [title])

  const titleElement = (
    <div
      ref={titleRef}
      style={{
        maxWidth: `${maxWidth}px`,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {title}
    </div>
  )

  return isTruncated ? (
    <Tooltip text={title}>
      {/* Tooltip will hijack the ref of the first div */}
      <div>{titleElement}</div>
    </Tooltip>
  ) : (
    titleElement
  )
}

export default TruncatedTitle
