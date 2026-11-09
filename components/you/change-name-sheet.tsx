"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useUpdateName } from "@/hooks/use-update-name";
import { cn } from "@/lib/utils";
import { crudErrorMessage, type CrudErrorCopy } from "@/lib/utils/handle-crud-error";
import {
  DISPLAY_NAME_MAX,
  normalizeDisplayName,
  updateNameBodySchema,
  type UpdateNameBody,
} from "@/types/me/me.types";

export interface ChangeNameSheetProps {
  open: boolean;
  name: string;
  tenantName: string;
  onClose: () => void;
  className?: string;
}

const NAME_ERROR_KEYS = ["nameRequired", "nameTooLong"] as const;
type NameErrorKey = (typeof NAME_ERROR_KEYS)[number];

function isNameErrorKey(value: string): value is NameErrorKey {
  return NAME_ERROR_KEYS.some((key) => key === value);
}

export function ChangeNameSheet({
  open,
  name,
  tenantName,
  onClose,
  className,
}: ChangeNameSheetProps) {
  if (!open) return null;
  return (
    <ChangeNameForm
      name={name}
      tenantName={tenantName}
      onClose={onClose}
      className={className}
    />
  );
}

export interface ChangeNameFormProps {
  name: string;
  tenantName: string;
  onClose: () => void;
  className?: string;
}

function ChangeNameForm({ name, tenantName, onClose, className }: ChangeNameFormProps) {
  const t = useTranslations("you");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tAction = useTranslations("errors.action");
  const update = useUpdateName();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const [failure, setFailure] = useState<string | null>(null);

  const form = useForm<UpdateNameBody>({
    resolver: zodResolver(updateNameBodySchema),
    defaultValues: { name },
  });
  const {
    register,
    handleSubmit,
    control,
    setError,
    clearErrors,
    formState: { errors },
  } = form;
  const watched = useWatch({ control, name: "name" }) ?? "";
  const unchanged = normalizeDisplayName(watched) === normalizeDisplayName(name);
  const registration = register("name");
  const nameError = errors.name?.message;
  const errorKey = typeof nameError === "string" && isNameErrorKey(nameError) ? nameError : null;
  const describedBy = errorKey ? `${hintId} ${errorId}` : hintId;

  function onValid(values: UpdateNameBody): void {
    if (values.name === normalizeDisplayName(name)) return;
    setFailure(null);
    update.mutate(values.name, {
      onSuccess: () => onClose(),
      onError: (error: unknown) => {
        const action = tAction("updateName");
        const copy: CrudErrorCopy = {
          cannot: tErrors("cannotAction", { action }),
          couldNot: tErrors("couldNotAction", { action }),
          chooseHousehold: tErrors("chooseHousehold"),
        };
        setFailure(crudErrorMessage(error, action, copy));
      },
    });
  }

  return (
    <OrbitSheet
      title={t("nameSheetTitle")}
      onClose={onClose}
      className={className}
      initialFocusRef={inputRef}
    >
      <form
        className="mt-3"
        onSubmit={(event) => {
          void handleSubmit(onValid)(event);
        }}
      >
        <p id={hintId} className="text-[15px] text-[var(--orbit-secondary)]">
          {t("nameSheetBody", { household: tenantName })}
        </p>
        <input
          {...registration}
          ref={(node) => {
            registration.ref(node);
            inputRef.current = node;
          }}
          onChange={(event) => {
            setFailure(null);
            if (event.target.value.length <= DISPLAY_NAME_MAX) clearErrors("name");
            void registration.onChange(event);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            const input = event.currentTarget;
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            const next = input.value.slice(0, start) + pasted + input.value.slice(end);
            if (next.length > DISPLAY_NAME_MAX) {
              event.preventDefault();
              setError("name", { type: "max", message: "nameTooLong" });
            }
          }}
          id={fieldId}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          aria-label={t("nameAria")}
          aria-invalid={errorKey ? true : undefined}
          aria-describedby={describedBy}
          className={cn("mt-4 orbit-field", errorKey && "border-[var(--orbit-short)]")}
        />
        {errorKey ? (
          <p id={errorId} className="mt-2 text-[15px] text-[var(--orbit-short)]">
            {t(errorKey)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={update.isPending || unchanged}
          className="mt-8 w-full orbit-btn h-auto whitespace-normal px-4 py-3 text-center disabled:opacity-60"
        >
          {failure ?? tCommon("save")}
        </button>
      </form>
    </OrbitSheet>
  );
}
