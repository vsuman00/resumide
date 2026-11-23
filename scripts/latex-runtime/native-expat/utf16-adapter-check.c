/* Check the test-only literal/diagnostic adapter, independently of parser tests. */
#include <expat.h>
#include <assert.h>
#include <string.h>
#include "resumide_utf16_test.h"
int main(void) {
  const XML_Char units[] = u"A\u03a9\U0001d11e";
  const char *left;
  const char *right;
  XML_Char long_text[300];
  assert(strcmp(resumide_utf16_diag(units), "A\\u03a9\\ud834\\udd1e") == 0);
  assert(strcmp(resumide_utf16_diag(NULL), "(null)") == 0);
  left = resumide_utf16_diag(u"left"); right = resumide_utf16_diag(u"right");
  assert(strcmp(left, "left") == 0 && strcmp(right, "right") == 0);
  for (int i = 0; i < 299; i++) long_text[i] = 0x03a9;
  long_text[299] = 0;
  left = resumide_utf16_diag(long_text);
  assert(strlen(left) < 256 && strstr(left, "...") != NULL);
  puts("native UTF-16 literal/diagnostic adapter checks passed");
  return 0;
}
