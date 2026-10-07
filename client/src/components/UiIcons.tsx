// Hermes Desktop's icon set: Tabler (apps/desktop/src/lib/icons.ts maps the
// same names), at Desktop's 16px default and stroke.
import {
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconLoader2,
  IconVolume,
  IconWaveSine,
  IconBook,
  IconChevronDown,
  IconCurrentLocation,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconDots,
  IconEdit,
  IconFolder,
  IconHeadset,
  IconLayoutSidebar,
  IconMessageCircle,
  IconMicrophone,
  IconPlayerStopFilled,
  IconRefresh,
  IconSettings,
  IconStack2,
  IconX,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconDownload,
  IconActivity,
  IconBolt,
  IconPlus,
} from '@tabler/icons-react'

const ICON = { size: 16, stroke: 1.75, 'aria-hidden': true } as const

export function CloseIcon() {
  return <IconX {...ICON} />
}

export function RefreshIcon() {
  return <IconRefresh {...ICON} />
}

export function ChevronDownIcon() {
  return <IconChevronDown {...ICON} size={14} />
}

export function MicrophoneIcon() {
  return <IconMicrophone {...ICON} />
}

export function SendIcon() {
  return <IconArrowUp {...ICON} stroke={2} />
}

export function StopIcon() {
  return <IconPlayerStopFilled {...ICON} size={12} />
}

export function SidebarIcon() {
  return <IconLayoutSidebar {...ICON} />
}

export function MoreIcon() {
  return <IconDots {...ICON} />
}

export function NewChatIcon() {
  return <IconEdit {...ICON} />
}

export type NavIconTab = 'chat' | 'sessions' | 'reader' | 'files' | 'support' | 'control'

export function NavIcon({ tab }: { tab: NavIconTab }) {
  switch (tab) {
    case 'chat':
      return <IconMessageCircle {...ICON} />
    case 'sessions':
      return <IconStack2 {...ICON} />
    case 'reader':
      return <IconBook {...ICON} />
    case 'files':
      return <IconFolder {...ICON} />
    case 'support':
      return <IconHeadset {...ICON} />
    default:
      return <IconSettings {...ICON} />
  }
}

export function FolderIcon() {
  return <IconFolder {...ICON} size={13} />
}

export function CopyIcon() {
  return <IconCopy {...ICON} size={14} />
}

export function CheckIcon() {
  return <IconCheck {...ICON} size={14} />
}

export function SpeakerIcon() {
  return <IconVolume {...ICON} size={14} />
}

export function LoaderIcon() {
  return <IconLoader2 {...ICON} size={14} className="spin-icon" />
}

export function VoiceModeIcon() {
  return <IconWaveSine {...ICON} />
}

export function PlayIcon() {
  return <IconPlayerPlayFilled {...ICON} size={14} />
}

export function PauseIcon() {
  return <IconPlayerPauseFilled {...ICON} size={14} />
}

export function FollowIcon() {
  return <IconCurrentLocation {...ICON} />
}

export function SearchIcon() {
  return <IconSearch {...ICON} size={14} />
}

export function ChevronLeftIcon() {
  return <IconChevronLeft {...ICON} />
}

export function ChevronRightIcon() {
  return <IconChevronRight {...ICON} size={14} />
}

export function ExternalLinkIcon() {
  return <IconExternalLink {...ICON} size={14} />
}

export function DownloadIcon() {
  return <IconDownload {...ICON} size={14} />
}

export function ActivityIcon() {
  return <IconActivity {...ICON} size={14} />
}

export function SettingsIcon() {
  return <IconSettings {...ICON} size={14} />
}

export function HeadsetIcon() {
  return <IconHeadset {...ICON} />
}

export function BoltIcon() {
  return <IconBolt {...ICON} size={14} />
}

export function PlusIcon() {
  return <IconPlus {...ICON} size={14} />
}
