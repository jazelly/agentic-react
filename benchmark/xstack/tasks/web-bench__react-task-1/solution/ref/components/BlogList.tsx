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

import React, { useCallback, useState, useRef, useEffect } from 'react'
import TruncatedTitle from './TruncatedTitle'

interface Blog {
  title: string
  detail: string
}

interface BlogListProps {
  blogs: Blog[]
  selectedBlog: string
  onSelectBlog: (title: string) => void
}

const ITEM_HEIGHT = 40 // Height of each blog item in pixels
const WINDOW_SIZE = 20 // Number of items to render at once

const BlogList: React.FC<BlogListProps> = React.memo(({ blogs, selectedBlog, onSelectBlog }) => {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const startIndex = Math.floor(scrollTop / ITEM_HEIGHT)
  const endIndex = Math.min(startIndex + WINDOW_SIZE, blogs.length)
  const visibleBlogs = blogs.slice(startIndex, endIndex)

  const totalHeight = blogs.length * ITEM_HEIGHT
  const offsetY = startIndex * ITEM_HEIGHT

  return (
    <div
      ref={containerRef}
      className="blog-list"
      style={{
        width: '300px',
        height: '600px',
        overflowY: 'auto',
        position: 'relative',
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
          }}
        >
          {visibleBlogs.map((blog) => (
            <div
              key={blog.title}
              className={`list-item ${selectedBlog === blog.title ? 'selected' : ''}`}
              onClick={() => onSelectBlog(blog.title)}
              style={{ height: ITEM_HEIGHT }}
            >
              <TruncatedTitle title={blog.title} maxWidth={300} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default BlogList
