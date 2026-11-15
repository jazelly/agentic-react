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

import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useDeleteBlog } from '../hooks/useDelete'
import Comments, { type CommentsRef } from './Comments'
import { renderMarkdown, sanitizeHTML } from '../utils/markdown'
import TruncatedTitle from './TruncatedTitle'

interface BlogProps {
  title: string
  detail: string
  onEdit: () => void
}

export interface BlogRef {
  focusAndTypeComment: () => void
}

const Blog = forwardRef<BlogRef, BlogProps>(({ title, detail, onEdit }, ref) => {
  const deleteBlog = useDeleteBlog()

  const commentsRef = useRef<CommentsRef>(null)
  useImperativeHandle(ref, () => ({
    focusAndTypeComment: () => commentsRef.current?.focusAndTypeComment(),
  }))

  return (
    <article style={{ position: 'relative' }}>
      <button
        className="delete-btn"
        onClick={() => deleteBlog(title)}
        style={{ position: 'absolute', top: 10, right: 80 }}
      >
        Delete
      </button>
      <button
        className="edit-btn"
        onClick={onEdit}
        style={{ position: 'absolute', top: 10, right: 10 }}
      >
        Edit
      </button>
      <h2 className="blog-title">
        <TruncatedTitle title={sanitizeHTML(title)} maxWidth={300} />
      </h2>
      <div style={{ width: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {renderMarkdown(sanitizeHTML(detail))}
      </div>
      <Comments ref={commentsRef} blogTitle={title} />
    </article>
  )
})

export default Blog
