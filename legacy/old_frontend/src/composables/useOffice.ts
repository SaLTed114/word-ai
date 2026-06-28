// src/composables/useOffice.ts
import { useAppStore } from '@/store/appStore';

// Explicitly define the return type of the composable
interface UseOfficeReturn {
    getSelectedText: () => Promise<string | null>;
    setSelectedText: (textToSet: string) => Promise<boolean>;
}

export function useOffice(): UseOfficeReturn {
    const appStore = useAppStore();
    // selectedText ref is internal to the composable, might not need explicit typing if not returned
    // const selectedText = ref<string>('');

    const getSelectedText = async (): Promise<string | null> => {
        // Type guard for Office context
        if (typeof Office === 'undefined' || !Office.context || !Office.context.document) {
            appStore.setError("Office context not available.", "Cannot get selected text.");
            return null;
        }

        return new Promise((resolve, reject) => {
            Office.context.document.getSelectedDataAsync(
                Office.CoercionType.Text,
                (asyncResult: Office.AsyncResult<string>) => { // Type the asyncResult
                    if (asyncResult.status === Office.AsyncResultStatus.Failed) {
                        console.error("Error getting selected text:", asyncResult.error.message);
                        appStore.setError("Failed to get selected text.", asyncResult.error.message);
                        // Ensure reject is called, although the promise returns null on error path currently
                        reject(asyncResult.error); // Technically rejects, but we resolve null below
                        // resolve(null); // Match current logic: return null on failure
                    } else {
                        const textValue = asyncResult.value;
                        if (!textValue?.trim()) { // Use optional chaining and check trim
                            // Don't set an error here, just return null for no selection
                            // appStore.setError("No text selected.", "Please select text in the document first.");
                            resolve(null); // Resolve with null if empty/whitespace
                        } else {
                            resolve(textValue);
                        }
                    }
                }
            );
        });
    };

    const setSelectedText = async (textToSet: string): Promise<boolean> => {
        if (typeof Office === 'undefined' || !Office.context || !Office.context.document) {
            appStore.setError("Office context not available.", "Cannot set selected text.");
            return false;
        }

        return new Promise((resolve) => { // No reject needed, resolve true/false
            Office.context.document.setSelectedDataAsync(
                textToSet,
                { coercionType: Office.CoercionType.Text },
                (asyncResult: Office.AsyncResult<void>) => { // Type the asyncResult
                    if (asyncResult.status === Office.AsyncResultStatus.Failed) {
                        console.error("Error setting selected text:", asyncResult.error.message);
                        appStore.setError("Failed to update document.", asyncResult.error.message);
                        resolve(false); // Indicate failure
                    } else {
                        console.log("Document updated successfully.");
                        resolve(true); // Indicate success
                    }
                }
            );
        });
    };

    return {
        getSelectedText,
        setSelectedText,
    };
}