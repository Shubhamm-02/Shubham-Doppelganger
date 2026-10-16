"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import { cx } from "@/lib/client/cx";

export type BookingDetails = { name: string; email: string };

type Field = keyof BookingDetails;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function validate(field: Field, value: string) {
  const trimmed = value.trim();
  if (field === "name") {
    if (!trimmed) return "Enter your name.";
    if (trimmed.length > 100) return "Keep your name under 100 characters.";
    return null;
  }
  if (!trimmed) return "Enter your email address.";
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) return "Enter a full email address, like jane@company.com.";
  return null;
}

export type BookingFormProps = {
  initial: BookingDetails;
  onSubmit(details: BookingDetails): void;
};

export function BookingForm({ initial, onSubmit }: BookingFormProps) {
  const [values, setValues] = useState(initial);
  const [shown, setShown] = useState<Record<Field, boolean>>({ name: false, email: false });
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const firstEmpty: Field = initial.name.trim() && !initial.email.trim() ? "email" : "name";

  const errors = { name: validate("name", values.name), email: validate("email", values.email) };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShown({ name: true, email: true });
    if (errors.name) return nameRef.current?.focus();
    if (errors.email) return emailRef.current?.focus();
    onSubmit({ name: values.name.trim(), email: values.email.trim() });
  }

  function fieldProps(field: Field) {
    return {
      value: values[field],
      error: shown[field] ? errors[field] : null,
      autoFocus: field === firstEmpty,
      onChange: (value: string) => setValues((current) => ({ ...current, [field]: value })),
      onBlur: () => {
        if (values[field].trim()) setShown((current) => ({ ...current, [field]: true }));
      }
    };
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField ref={nameRef} label="Name" type="text" autoComplete="name" {...fieldProps("name")} />
        <TextField ref={emailRef} label="Email" type="email" autoComplete="email" inputMode="email" {...fieldProps("email")} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm">
          Review
        </Button>
      </div>
    </form>
  );
}

type TextFieldProps = {
  ref: React.Ref<HTMLInputElement>;
  label: string;
  type: "text" | "email";
  autoComplete: string;
  inputMode?: "email";
  value: string;
  error: string | null;
  autoFocus: boolean;
  onChange(value: string): void;
  onBlur(): void;
};

function TextField({ ref, label, type, autoComplete, inputMode, value, error, autoFocus, onChange, onBlur }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-13 font-medium text-fg">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={autoComplete}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoCapitalize={type === "email" ? "none" : "words"}
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={cx(
          "h-10 w-full rounded-md bg-surface px-3 text-[16px] leading-6 text-fg sm:text-14",
          "shadow-[0_0_0_1px_var(--color-border-strong)] transition-shadow duration-(--duration-fast) ease-out",
          "placeholder:text-fg-subtle hover:shadow-[0_0_0_1px_var(--color-fg-subtle)]",
          "focus-visible:outline-offset-0 aria-invalid:shadow-[0_0_0_1px_var(--color-danger)]"
        )}
      />
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-12 text-danger">
          <AlertIcon className="mt-px shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
