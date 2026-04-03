import { Link } from 'react-router-dom'
import { resolveApiUrl } from '../../services/api'

type Props = {
  username: string | null
  avatarUrl?: string | null
  stopPropagation?: boolean
  linkEnabled?: boolean
}

export default function CommunityAuthorChip({
  username,
  avatarUrl,
  stopPropagation = false,
  linkEnabled = true,
}: Props) {
  const safeName = username?.trim() || '—'
  const avatarLetter = safeName === '—' ? '•' : safeName[0].toUpperCase()

  if (!username?.trim() || !linkEnabled) {
    return (
      <span className="community-author-chip community-author-chip-disabled">
        <span className="community-author-avatar" aria-hidden="true">
          {avatarUrl ? <img src={resolveApiUrl(avatarUrl) || ''} alt="" className="community-author-avatar-img" /> : avatarLetter}
        </span>
        <span className="community-author-name">{safeName}</span>
      </span>
    )
  }

  return (
    <Link
      className="community-author-chip"
      to={`/user/${encodeURIComponent(username)}`}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
      }}
    >
      <span className="community-author-avatar" aria-hidden="true">
        {avatarUrl ? <img src={resolveApiUrl(avatarUrl) || ''} alt="" className="community-author-avatar-img" /> : avatarLetter}
      </span>
      <span className="community-author-name">{username}</span>
    </Link>
  )
}
