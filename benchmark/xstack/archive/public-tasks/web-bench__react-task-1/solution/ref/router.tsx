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
import App from './App'
import Game from './pages/Game'
import { BlogProvider } from './context/BlogContext'

const Router: React.FC = () => {
  const [currentPath, setCurrentPath] = React.useState(window.location.pathname)

  React.useEffect(() => {
    const onLocationChange = () => {
      setCurrentPath(window.location.pathname)
    }

    window.addEventListener('popstate', onLocationChange)

    return () => window.removeEventListener('popstate', onLocationChange)
  }, [])

  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }

  return (
    <BlogProvider>
      <div>
        {currentPath === '/' && <App navigate={navigate} />}
        {currentPath === '/game' && <Game navigate={navigate} />}
      </div>
    </BlogProvider>
  )
}

export default Router
