import type { ComponentProps } from "react";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
export type StringFieldControl = {
  state: {
    value: string;
    meta: { isTouched: boolean; errors: readonly unknown[] };
  };
  handleChange(value: string): void;
  handleBlur(): void;
};
type Props = Omit<
  ComponentProps<typeof TextField>,
  "value" | "onChangeText" | "onBlur" | "error"
> & {
  field: StringFieldControl;
  options?: readonly { value: string; label: string }[];
};
export function FormField({ field, options, label, ...props }: Props) {
  const issue = field.state.meta.isTouched
    ? field.state.meta.errors[0]
    : undefined;
  const error =
    typeof issue === "string"
      ? issue
      : issue &&
          typeof issue === "object" &&
          "message" in issue &&
          typeof issue.message === "string"
        ? issue.message
        : undefined;
  return options ? (
    <SelectField
      label={label}
      value={field.state.value}
      options={options}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      error={error}
      disabled={props.editable === false}
    />
  ) : (
    <TextField
      {...props}
      label={label}
      accessibilityLabel={props.accessibilityLabel ?? label}
      value={field.state.value}
      onChangeText={field.handleChange}
      onBlur={field.handleBlur}
      error={error}
    />
  );
}
