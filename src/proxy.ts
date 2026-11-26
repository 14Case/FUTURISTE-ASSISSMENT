import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const PUBLIC_PATHS = [
  "/connexion",
  "/initialisation",
  "/configuration-requise",
  "/manifest.webmanifest",
];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/api/auth/bootstrap") ||
    pathname.startsWith("/api/health")
  );
}

/**
 * Proxy Next.js 16 (remplace middleware.ts déprécié) :
 * - Rafraîchit les jetons de session Supabase Auth sur chaque requête.
 * - Redirige les visiteurs non authentifiés vers /connexion.
 * - Redirige vers /configuration-requise tant que les variables Supabase ne sont pas renseignées.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    if (
      pathname === "/configuration-requise" ||
      pathname.startsWith("/api/health") ||
      pathname === "/manifest.webmanifest"
    ) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Configuration Supabase requise (.env.local)." },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/configuration-requise", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Session expirée ou non authentifiée." },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/connexion", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("suivant", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/connexion") {
    return NextResponse.redirect(new URL("/tableau-de-bord", request.url));
  }

  supabaseResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|brand/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
