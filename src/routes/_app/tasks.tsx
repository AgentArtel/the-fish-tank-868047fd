import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/tasks")({ component: TasksPage });

function TasksPage() {
  return (
    <ComingSoon
      title="Tasks / SOPs"
      description="Repeatable workflows and checklists that keep store operations on rails."
      bullets={[
        "Repeatable workflows",
        "Content checklists",
        "Product intake checklists",
        "Weekly store operations tasks",
      ]}
    />
  );
}
