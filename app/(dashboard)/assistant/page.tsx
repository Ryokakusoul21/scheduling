import { requireUser } from "@/lib/auth/session";
import { isStaff, type AppRole } from "@/lib/permissions/roles";
import { Card } from "@/components/ui/card";
import { AssistantChat, AssistantHeader } from "@/components/assistant/assistant-chat";
import { getAssistantHistory } from "./actions";

export const metadata = { title: "AI Assistant · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default async function AssistantPage() {
  const user = await requireUser();
  const history = await getAssistantHistory();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask about your classes, rooms, instructors, and schedule requests.
        </p>
      </div>

      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <AssistantHeader />
        </div>
        <AssistantChat initialMessages={history} userName={user.name} staff={isStaff(user.role as AppRole)} className="h-[calc(100dvh-16rem)] min-h-96" />
      </Card>
    </div>
  );
}
