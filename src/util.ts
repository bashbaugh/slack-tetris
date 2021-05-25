
// https://stackoverflow.com/a/12646864
export function shuffleArray<T extends unknown>(array: T[]): T[] {
  const shuffled = array.slice()

  for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled
}

/** Like forEach but for a 2d array (used for tetromino shapes). If the function returns a non-falsy value the loop will break and return the result */
export function iterateMatrix<T, I>(array: T[][], forEach: (el: T, i: number, j: number) => I): I | false {
  for (let i = 0; i < array.length; i++) {
    for (let j = 0; j < array[i].length; j++) {
      const funcResult = forEach(array[i][j], i, j)
      if (funcResult) return funcResult
    }
  }

  return false
}

/** Return a minutes:seconds string from milliseconds */
export function formatMilliseconds(ms: number) {
  const minutes = Math.floor(ms / 1000 / 60)
  const seconds = Math.floor(ms / 1000 % 60)
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
}