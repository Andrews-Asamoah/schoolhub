import type { SchoolHubtelConnectionInput } from "@schoolhub/shared";
export const emptySchoolSms = (): SchoolHubtelConnectionInput => ({
  senderId: "",
  clientId: "",
  clientSecret: "",
  apiBaseUrl: "https://sms.hubtel.com/v1/messages",
});
const input =
  "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function SchoolSmsFields({
  value,
  onChange,
  disabled = false,
}: {
  value: SchoolHubtelConnectionInput;
  onChange: (value: SchoolHubtelConnectionInput) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
        Approved Hubtel sender ID
        <input
          className={input}
          required
          maxLength={11}
          pattern="[A-Za-z0-9]{1,11}"
          value={value.senderId}
          onChange={(event) =>
            onChange({ ...value, senderId: event.target.value })
          }
          autoComplete="off"
        />
        <span className="font-normal text-muted-foreground">
          1–11 letters/numbers. Approval is managed in Hubtel.
        </span>
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
        Hubtel API endpoint
        <select
          className={input}
          value={value.apiBaseUrl}
          onChange={(event) =>
            onChange({
              ...value,
              apiBaseUrl: event.target
                .value as SchoolHubtelConnectionInput["apiBaseUrl"],
            })
          }
        >
          <option value="https://sms.hubtel.com/v1/messages">
            sms.hubtel.com
          </option>
          <option value="https://smsc.hubtel.com/v1/messages">
            smsc.hubtel.com
          </option>
        </select>
        <span className="font-normal text-muted-foreground">
          Choose the host shown in the school's Hubtel API details.
        </span>
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
        Hubtel Client ID
        <input
          className={input}
          required
          maxLength={128}
          value={value.clientId}
          onChange={(event) =>
            onChange({ ...value, clientId: event.target.value })
          }
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
        Hubtel Client secret
        <input
          className={input}
          type="password"
          required
          maxLength={256}
          value={value.clientSecret}
          onChange={(event) =>
            onChange({ ...value, clientSecret: event.target.value })
          }
          autoComplete="new-password"
          spellCheck={false}
        />
      </label>
    </fieldset>
  );
}
