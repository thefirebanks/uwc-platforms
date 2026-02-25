import { render } from "@testing-library/react";
import { AdminProcessesDashboard } from "@/components/admin-processes-dashboard";

test("Renders layout correctly", () => {
  const { container } = render(<AdminProcessesDashboard initialProcesses={[]} />);
  console.log(container.innerHTML);
});
