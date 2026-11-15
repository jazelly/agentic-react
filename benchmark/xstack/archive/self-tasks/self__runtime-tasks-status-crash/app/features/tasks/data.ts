export interface Option { value: string; label: string; icon: string }

export const statuses: Option[] = [
  { value: 'backlog', label: 'Backlog', icon: '◌' },
  { value: 'todo', label: 'Todo', icon: '○' },
  { value: 'in progress', label: 'In Progress', icon: '◔' },
  { value: 'done', label: 'Done', icon: '●' },
  { value: 'canceled', label: 'Canceled', icon: '⊘' },
]

export const priorities: Option[] = [
  { value: 'low', label: 'Low', icon: '↓' },
  { value: 'medium', label: 'Medium', icon: '→' },
  { value: 'high', label: 'High', icon: '↑' },
]

export interface Task { id: string; title: string; status: string; priority: string; label: string }

export const tasks: Task[] = [
  { id: 'TASK-8782', title: "You can't compress the program without quantifying the open-source SSD pixel!", status: 'in progress', priority: 'medium', label: 'documentation' },
  { id: 'TASK-7878', title: 'Try to calculate the EXE feed, maybe it will index the multi-byte pixel!', status: 'backlog', priority: 'medium', label: 'documentation' },
  { id: 'TASK-7839', title: 'We need to bypass the neural TCP card!', status: 'todo', priority: 'high', label: 'bug' },
  { id: 'TASK-5562', title: 'The SAS interface is down, bypass the open-source pixel so we can back up the PNG bandwidth!', status: 'backlog', priority: 'medium', label: 'feature' },
  { id: 'TASK-8686', title: "I'll parse the wireless SSL protocol, that should driver the API panel!", status: 'canceled', priority: 'medium', label: 'feature' },
  { id: 'TASK-1280', title: 'Use the digital TLS panel, then you can transmit the haptic system!', status: 'done', priority: 'high', label: 'bug' },
  { id: 'TASK-7262', title: 'The UTF8 application is down, parse the neural bandwidth so we can back up the PNG firewall!', status: 'archived', priority: 'high', label: 'feature' },
  { id: 'TASK-1138', title: "Generating the driver won't do anything, we need to quantify the 1080p SMTP bandwidth!", status: 'in progress', priority: 'medium', label: 'feature' },
]
