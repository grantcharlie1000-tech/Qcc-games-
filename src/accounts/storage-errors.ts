// Server-only database error classification. Never return or log driver messages/parameters.
import {isStorageFullError,storageFullResponse as fullResponse} from '../../server/storage-full';

export function storageFullResponse(error:unknown):Response|undefined {
 return isStorageFullError(error)?fullResponse():undefined;
}
