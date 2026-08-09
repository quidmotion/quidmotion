import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shared/AuthForm";
import { loginAction } from "@/lib/actions/auth";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { getAuth } from "@/lib/auth";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getAuth().getSession();
  if (session) {
    if (session.user.role === "admin" || session.user.role === "support") {
      redirect("/admin");
    }
    redirect("/dashboard");
  }

  const sp = await searchParams;
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <div className="px-4 py-16">
        <AuthForm
          title="Welcome back"
          subtitle="Sign in to your QuidMotion portfolio."
          action={loginAction}
          submitLabel="Log in"
          mode="login"
          next={sp.next}
        />
      </div>
    </div>
  );
}
