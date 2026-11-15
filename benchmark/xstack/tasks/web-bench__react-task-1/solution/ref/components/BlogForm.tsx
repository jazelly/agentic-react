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
import { useBlogContext } from '../context/BlogContext'
import { useEditBlog } from '../hooks/useEdit'
import { showToast } from '../utils/toast'

interface BlogFormProps {
  onClose: () => void
  visibleCount: number
  editMode: boolean
}

const BlogForm: React.FC<BlogFormProps> = ({ onClose, visibleCount, editMode }) => {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const { blogs, setBlogs, setSelectedBlog, selectedBlog } = useBlogContext()
  const editBlog = useEditBlog()

  useEffect(() => {
    if (editMode && selectedBlog) {
      const blogToEdit = blogs.find((blog) => blog.title === selectedBlog)
      if (blogToEdit) {
        setTitle(blogToEdit.title)
        setDetail(blogToEdit.detail)
      }
    }
  }, [editMode, selectedBlog, blogs])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const duplicationCheckList = editMode
      ? blogs.filter((blog) => blog.title !== selectedBlog)
      : blogs

    if (duplicationCheckList.some((blog) => blog.title === title)) {
      setError('A blog with this title already exists')
      return
    }

    if (editMode) {
      editBlog(selectedBlog, title, detail)
      showToast('Blog Edited Successfully')
    } else {
      const newBlog = { title, detail }
      setBlogs([...blogs, newBlog])
      setSelectedBlog(title)
      showToast('New Blog Created Success')
    }
    onClose()
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>{editMode ? 'Edit Blog' : 'Create Blog'}</h2>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
        <div className="visible-count">{visibleCount}</div>
        <form onSubmit={handleSubmit}>
          <label htmlFor="title">Title:</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <label htmlFor="detail">Detail (Markdown supported):</label>
          <textarea
            id="detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            required
            style={{ height: 500, width: 700 }}
          ></textarea>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit" className="submit-btn">
            Submit
          </button>
        </form>
      </div>
    </div>
  )
}

export default BlogForm
