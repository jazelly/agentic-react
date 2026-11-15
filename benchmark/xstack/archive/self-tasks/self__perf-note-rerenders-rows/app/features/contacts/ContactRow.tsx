import { memo } from 'react'
import { useRenderCount } from '../../lib/render-count'
import type { Contact } from './data'

interface Props {
  contact: Contact
  selected: boolean
  onSelect: (id: number) => void
}

export const ContactRow = memo(function ContactRow({ contact, selected, onSelect }: Props) {
  useRenderCount('ContactRow')
  return (
    <li
      role="option"
      aria-selected={selected}
      data-contact-id={contact.id}
      onClick={() => onSelect(contact.id)}
      style={{ padding: '4px 8px', cursor: 'pointer', background: selected ? '#dbeafe' : undefined }}
    >
      <strong>{contact.name}</strong> <span style={{ color: '#666' }}>{contact.email}</span> · {contact.company}
    </li>
  )
})
