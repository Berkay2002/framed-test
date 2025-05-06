import { useState, useCallback } from 'react';

type FieldErrors<T> = Partial<Record<keyof T, string>>;

type FormState<T> = {
  /** Form values */
  values: T;
  /** Field-level errors */
  errors: FieldErrors<T>;
  /** Whether the form is currently being submitted */
  isSubmitting: boolean;
  /** Whether the form has been submitted at least once */
  isDirty: boolean;
  /** Whether all required fields are filled and there are no errors */
  isValid: boolean;
};

type FormConfig<T> = {
  /** Initial form values */
  initialValues: T;
  /** Validation function */
  validate?: (values: T) => FieldErrors<T>;
  /** Submit handler */
  onSubmit?: (values: T) => Promise<void> | void;
  /** Required field keys */
  requiredFields?: Array<keyof T>;
};

/**
 * Custom hook for managing form state
 * 
 * @example
 * const { values, errors, handleChange, handleSubmit, isSubmitting, isValid } = useFormState({
 *   initialValues: { email: '', password: '' },
 *   requiredFields: ['email', 'password'],
 *   validate: (values) => {
 *     const errors: FieldErrors<typeof values> = {};
 *     if (!values.email.includes('@')) errors.email = 'Invalid email';
 *     if (values.password.length < 6) errors.password = 'Password too short';
 *     return errors;
 *   },
 *   onSubmit: async (values) => {
 *     await createAccount(values);
 *   }
 * });
 */
export function useFormState<T extends Record<string, any>>(config: FormConfig<T>) {
  const {
    initialValues,
    validate,
    onSubmit,
    requiredFields = [],
  } = config;
  
  const [formState, setFormState] = useState<FormState<T>>({
    values: initialValues,
    errors: {},
    isSubmitting: false,
    isDirty: false,
    isValid: false,
  });
  
  // Validate the form values and update isValid state
  const validateForm = useCallback((values: T) => {
    const validationErrors: FieldErrors<T> = validate ? validate(values) : {};
    
    // Check if required fields are filled
    requiredFields.forEach((field) => {
      const value = values[field];
      if (value === undefined || value === null || value === '') {
        validationErrors[field] = `${String(field)} is required`;
      }
    });
    
    const isValid = Object.keys(validationErrors).length === 0;
    
    return { validationErrors, isValid };
  }, [validate, requiredFields]);
  
  // Handle input change
  const handleChange = useCallback((field: keyof T, value: any) => {
    setFormState((prev) => {
      const newValues = { ...prev.values, [field]: value };
      const { validationErrors, isValid } = validateForm(newValues);
      
      return {
        ...prev,
        values: newValues,
        errors: validationErrors,
        isDirty: true,
        isValid,
      };
    });
  }, [validateForm]);
  
  // Handle blur event for field validation
  const handleBlur = useCallback((field: keyof T) => {
    setFormState((prev) => {
      const { validationErrors, isValid } = validateForm(prev.values);
      
      return {
        ...prev,
        errors: validationErrors,
        isValid,
      };
    });
  }, [validateForm]);
  
  // Reset the form to initial values
  const resetForm = useCallback(() => {
    setFormState({
      values: initialValues,
      errors: {},
      isSubmitting: false,
      isDirty: false,
      isValid: false,
    });
  }, [initialValues]);
  
  // Submit the form
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    setFormState((prev) => ({ ...prev, isSubmitting: true }));
    
    const { validationErrors, isValid } = validateForm(formState.values);
    
    setFormState((prev) => ({
      ...prev,
      errors: validationErrors,
      isValid,
    }));
    
    if (isValid && onSubmit) {
      try {
        await onSubmit(formState.values);
      } catch (error) {
        console.error('Form submission error:', error);
      }
    }
    
    setFormState((prev) => ({ ...prev, isSubmitting: false }));
  }, [formState.values, onSubmit, validateForm]);
  
  // Update field value without validation (for controlled components)
  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setFormState((prev) => ({
      ...prev,
      values: { ...prev.values, [field]: value },
      isDirty: true,
    }));
  }, []);
  
  // Set an error message for a specific field
  const setFieldError = useCallback((field: keyof T, message: string) => {
    setFormState((prev) => ({
      ...prev,
      errors: { ...prev.errors, [field]: message },
      isValid: false,
    }));
  }, []);
  
  return {
    ...formState,
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    setFieldValue,
    setFieldError,
  };
} 