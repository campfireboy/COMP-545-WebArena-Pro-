import AutoLoginClient from "./auto-login";

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AgentLoginPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const email = (searchParams?.email as string) || "agent@test.com";
    const password = (searchParams?.password as string) || "password123";

    return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
            <h1>Agent Auto-Login</h1>
            <AutoLoginClient email={email} password={password} />
            <p>
                Typically this page is accessed by automated agents to establish a session before starting a task.
            </p>
        </div>
    );
}
