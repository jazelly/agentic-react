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

import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { useBlogComments } from '../store/Comment'
import { showToast } from '../utils/toast'

interface CommentsProps {
  blogTitle: string
}

export interface CommentsRef {
  focusAndTypeComment: () => void
}

const Comments = forwardRef<CommentsRef, CommentsProps>(({ blogTitle }, ref) => {
  const [newComment, setNewComment] = useState('')
  const { addComment, comments } = useBlogComments(blogTitle)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focusAndTypeComment: () => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        setNewComment('Charming Blog!')
      }
    }
  }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newComment.trim()) {
      addComment(newComment)
      setNewComment('')
      showToast('New Comment Created Success!')
    }
  }

  return (
    <div>
      <h3>Comments</h3>
      {comments.map((comment, index) => (
        <div key={index} className="comment-item">
          <p>{comment}</p>
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Enter Your Comment"
        />
        <button type="submit" className="comment-btn">
          Submit Comment
        </button>
      </form>
    </div>
  )
})

export default Comments