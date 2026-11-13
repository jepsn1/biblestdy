import { defaultSvgIcons, type IconKey } from "@mdxeditor/editor";
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  Copy,
  ExternalLink,
  Italic,
  Link,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Redo2,
  Settings,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  X,
} from "lucide-react";

/** MDXEditor's toolbar in lucide (#66): same 16px / 1.75 stroke icons as the
 * rest of the app instead of its Material glyphs. Unmapped keys keep the
 * editor's own icon. */
const ICONS: Partial<Record<IconKey, LucideIcon>> = {
  undo: Undo2,
  redo: Redo2,
  format_bold: Bold,
  format_italic: Italic,
  format_underlined: Underline,
  strikeThrough: Strikethrough,
  code: Code,
  format_list_bulleted: List,
  format_list_numbered: ListOrdered,
  format_list_checked: ListChecks,
  link: Link,
  link_off: Link2Off,
  open_in_new: ExternalLink,
  table: Table,
  horizontal_rule: Minus,
  arrow_drop_down: ChevronDown,
  edit: Pencil,
  content_copy: Copy,
  more_horiz: MoreHorizontal,
  more_vert: MoreVertical,
  close: X,
  settings: Settings,
  delete_big: Trash2,
  delete_small: Trash2,
  check: Check,
};

export function editorIcon(name: IconKey) {
  const Icon = ICONS[name];
  return Icon ? <Icon className="size-4" aria-hidden /> : defaultSvgIcons[name];
}
