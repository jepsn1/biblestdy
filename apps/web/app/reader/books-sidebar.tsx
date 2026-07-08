import { BOOKS, findBook } from "@biblestdy/shared";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { authClient } from "~/lib/auth-client";

const OLD_TESTAMENT = BOOKS.slice(0, 39);
const NEW_TESTAMENT = BOOKS.slice(39);

export function BooksSidebar({ book }: { book: string }) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();

  // Match display name, or any alias the reference parser accepts ("jn", "1jo"…)
  const matches = (b: (typeof BOOKS)[number]) =>
    query === "" ||
    b.name.toLowerCase().includes(query) ||
    b.aliases.some((a) => a.startsWith(query)) ||
    findBook(query)?.id === b.id;

  const oldTestament = OLD_TESTAMENT.filter(matches);
  const newTestament = NEW_TESTAMENT.filter(matches);

  return (
    <Sidebar>
      <SidebarHeader className="gap-2 px-4 pt-3">
        <Link to="/" className="flex select-none items-baseline gap-1.5" aria-label="Home">
          <span className="font-mono text-sm font-semibold tracking-tight text-primary">
            biblestdy
          </span>
          <span className="font-mono text-[0.6rem] text-muted-foreground">v0</span>
        </Link>
        <SidebarInput
          placeholder="Filter books…"
          aria-label="Filter books"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </SidebarHeader>
      <SidebarContent>
        {oldTestament.length > 0 && (
          <BookGroup label="Old Testament" books={oldTestament} current={book} />
        )}
        {newTestament.length > 0 && (
          <BookGroup label="New Testament" books={newTestament} current={book} />
        )}
        {oldTestament.length === 0 && newTestament.length === 0 && (
          <p className="px-4 py-2 font-mono text-xs text-muted-foreground">No books match</p>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-border px-4 py-3">
        <SessionFooter />
      </SidebarFooter>
    </Sidebar>
  );
}

function SessionFooter() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending || !session) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
        {session.user.email}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        onClick={() =>
          void authClient.signOut().then(() => navigate("/signin"))
        }
      >
        <LogOut />
      </Button>
    </div>
  );
}

function BookGroup({
  label,
  books,
  current,
}: {
  label: string;
  books: readonly (typeof BOOKS)[number][];
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
