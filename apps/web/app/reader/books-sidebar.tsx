import { BOOKS } from "@biblestdy/shared";
import { Link } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

const OLD_TESTAMENT = BOOKS.slice(0, 39);
const NEW_TESTAMENT = BOOKS.slice(39);

export function BooksSidebar({ book }: { book: string }) {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 pt-3">
        <Link to="/" className="flex select-none items-baseline gap-1.5" aria-label="Home">
          <span className="font-mono text-sm font-semibold tracking-tight text-primary">
            biblestdy
          </span>
          <span className="font-mono text-[0.6rem] text-muted-foreground">v0</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <BookGroup label="Old Testament" books={OLD_TESTAMENT} current={book} />
        <BookGroup label="New Testament" books={NEW_TESTAMENT} current={book} />
      </SidebarContent>
    </Sidebar>
  );
}

function BookGroup({
  label,
  books,
  current,
}: {
  label: string;
  books: typeof OLD_TESTAMENT;
  current: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-mono text-[0.6rem] tracking-widest uppercase">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {books.map((b) => (
            <SidebarMenuItem key={b.id}>
              <SidebarMenuButton
                isActive={b.id === current}
                size="sm"
                render={<Link to={`/read/${b.id}/1`}>{b.name}</Link>}
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
