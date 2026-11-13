import { useTranslation } from "react-i18next";
import { BOOKS, findBook } from "@biblestdy/shared";
import { LogOut } from "lucide-react";
import { useCallback, useState } from "react";
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
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();

  // Match display name, or any alias the reference parser accepts ("jn", "1jo"…)
  const matches = (b: (typeof BOOKS)[number]) =>
    query === "" ||
    b.name.toLowerCase().includes(query) ||
    b.aliases.some((a) => a.startsWith(query)) ||
    findBook(query)?.id === b.id;

  // Current book scrolled into view (#52) whenever the list mounts (phone
  // sheet opens) or the book changes. Not scrollIntoView: that could also
  // move the locked body.
  const contentRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !book) return;
      const reveal = () => {
        const item = el.querySelector<HTMLElement>("[data-active]");
        if (!item) return;
        const top = item.getBoundingClientRect().top - el.getBoundingClientRect().top;
        if (top < 0 || top + item.offsetHeight > el.clientHeight) {
          el.scrollTop += top - el.clientHeight / 3;
        }
      };
      reveal();
      // Webfont swap changes row heights on first load: check again
      void document.fonts?.ready.then(reveal);
    },
    [book],
  );

  const oldTestament = OLD_TESTAMENT.filter(matches);
  const newTestament = NEW_TESTAMENT.filter(matches);

  return (
    <Sidebar>
      <SidebarHeader className="gap-2 px-4 pt-3">
        <Link to="/" className="flex select-none items-baseline gap-1.5" aria-label={t("sidebar.home")}>
          <span className="font-mono text-sm font-semibold tracking-tight text-primary">
            biblestdy
          </span>
          <span className="font-mono text-[0.6rem] text-muted-foreground">v0</span>
        </Link>
        <SidebarInput
          placeholder={t("sidebar.filterBooks")}
          aria-label={t("sidebar.filterBooks")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </SidebarHeader>
      <SidebarContent ref={contentRef}>
        {oldTestament.length > 0 && (
          <BookGroup label={t("sidebar.oldTestament")} books={oldTestament} current={book} />
        )}
        {newTestament.length > 0 && (
          <BookGroup label={t("sidebar.newTestament")} books={newTestament} current={book} />
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
  const { t } = useTranslation();
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
        aria-label={t("sidebar.signOut")}
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
                className="data-active:font-semibold data-active:text-primary"
                render={
                  <Link
                    to={`/read/${b.id}/1`}
                    aria-current={b.id === current ? "page" : undefined}
                  >
                    {b.name}
                  </Link>
                }
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
