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

import { useBlogContext } from '../context/BlogContext'
import { commentStore } from '../store/Comment'

export const useEditBlog = () => {
  const { blogs, setBlogs, setSelectedBlog } = useBlogContext()

  const editBlog = (oldTitle: string, newTitle: string, newDetail: string) => {
    const updatedBlogs = blogs.map((blog) =>
      blog.title === oldTitle ? { title: newTitle, detail: newDetail } : blog
    )
    setBlogs(updatedBlogs)
    setSelectedBlog(newTitle)

    // Update comments for the edited blog
    if (oldTitle !== newTitle) {
      commentStore.switchBlogComments(oldTitle, newTitle)
    }
  }

  return editBlog
}
