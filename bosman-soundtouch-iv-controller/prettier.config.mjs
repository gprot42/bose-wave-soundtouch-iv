/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

/*
 * Copyright (c) 2025. Kambrium Software GmbH
 *
 * This software is confidential and proprietary information of Kambrium Software GmbH.
 * Use of this software is governed by the terms of a written license agreement
 * between you and Kambrium Software GmbH.
 *
 * This software is not open source and may not be redistributed, modified,
 * or disclosed in whole or in part without prior written permission from
 * Kambrium Software GmbH.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

export default {
  semi: true,
  singleQuote: true,
  printWidth: 120,
  tabWidth: 2,
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
  plugins: ['prettier-plugin-svelte'],
  overrides: [
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',
      },
    },
  ],
};
