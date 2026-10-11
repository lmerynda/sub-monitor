// Web Locks coordinate both active and suspended tabs on this origin.
export function browserLock<T>(
  name: string,
  work: () => Promise<T> | T,
): Promise<T> {
  if (!navigator.locks)
    return Promise.reject(
      new Error('Safe saving needs a current browser over HTTPS or localhost.'),
    );
  return navigator.locks.request(`renew-${name}`, work);
}
