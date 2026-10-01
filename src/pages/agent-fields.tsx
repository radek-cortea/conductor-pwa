import { agentModels, pickerAgents } from "@/lib/agent-models";
import { isPickerAgent } from "@/lib/agent-picker";
import type { PickerAgent } from "@/api/types";
import { Label } from "@/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";

type AgentFieldsProps = {
  idPrefix: string;
  agent: PickerAgent;
  model: string;
  effort: string;
  onAgentChange: (agent: PickerAgent) => void;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
};

export function AgentFields({
  idPrefix,
  agent,
  model,
  effort,
  onAgentChange,
  onModelChange,
  onEffortChange,
}: AgentFieldsProps) {
  const options = agentModels[agent];
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-agent`}>Agent</Label>
        <Select
          value={agent}
          onValueChange={(value) => {
            if (isPickerAgent(value)) onAgentChange(value);
          }}
        >
          <SelectTrigger id={`${idPrefix}-agent`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pickerAgents.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger id={`${idPrefix}-model`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.models.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-effort`}>Effort</Label>
        <Select value={effort} onValueChange={onEffortChange}>
          <SelectTrigger id={`${idPrefix}-effort`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.efforts.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
