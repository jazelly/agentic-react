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

import React, { useState, useCallback } from 'react'
import Header from './components/Header'
import Main, { type MainRef } from './components/Main'
import BlogForm from './components/BlogForm'
import { BlogProvider } from './context/BlogContext'
import './App.css'

interface AppProps {
  navigate: (path: string) => void
}

const App: React.FC<AppProps> = ({ navigate }) => {
  const [showBlogForm, setShowBlogForm] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [editMode, setEditMode] = useState(false)

  const handleShowBlogForm = useCallback(() => {
    setShowBlogForm(true)
    setEditMode(false)
    setVisibleCount((prevCount) => prevCount + 1)
  }, [])

  const handleEditBlog = useCallback(() => {
    setShowBlogForm(true)
    setEditMode(true)
    setVisibleCount((prevCount) => prevCount + 1)
  }, [])

  const mainRef = React.useRef<MainRef>(null)

  const handleFastComment = useCallback(() => {
    mainRef.current?.focusAndTypeComment()
  }, [])

  return (
    <div className="App">
      <Header
        onAddBlog={handleShowBlogForm}
        onFastComment={handleFastComment}
        navigate={navigate}
      />
      <Main ref={mainRef} onEditBlog={handleEditBlog} />
      {showBlogForm && (
        <BlogForm
          onClose={() => setShowBlogForm(false)}
          visibleCount={visibleCount}
          editMode={editMode}
        />
      )}
    </div>
  )
}

export default App
