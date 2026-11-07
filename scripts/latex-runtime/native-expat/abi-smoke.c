/* Compile with Trixie 2.9 headers; verify actual code units with both libraries. */
#include <expat.h>
#include <stdio.h>
#include <string.h>
#ifdef XML_UNICODE
# include <uchar.h>
_Static_assert(sizeof(XML_Char) == 2, "keep the Debian UTF-16 ABI");
_Static_assert(sizeof(XML_LChar) == 1, "version/error APIs remain byte strings");
static const XML_Char expected[] = u"neutral & safe \u03a9 \U0001d11e";
#else
_Static_assert(sizeof(XML_Char) == 1, "keep the narrow UTF-8 ABI");
static const XML_Char expected[] = "neutral & safe \xce\xa9 \xf0\x9d\x84\x9e";
#endif
static size_t position;
static int elements;
static int invalid;
static void XMLCALL start(void *data, const XML_Char *name, const XML_Char **attrs) {
  const char *wanted = elements == 0 ? "fontconfig" : "dir";
  size_t i;
  (void)data;
  for (i = 0; wanted[i]; i++) if (name[i] != (XML_Char)wanted[i]) invalid = 1;
  if (name[i] != 0 || attrs == NULL || attrs[0] != NULL) invalid = 1;
  elements++;
}
static void XMLCALL text(void *data, const XML_Char *value, int length) {
  (void)data;
  for (int i = 0; i < length; i++, position++) {
    if (position >= sizeof(expected) / sizeof(expected[0]) - 1
        || value[i] != expected[position]) invalid = 1;
  }
}
int main(int argc, char **argv) {
  const char *xml = "<!DOCTYPE fontconfig [<!ENTITY neutral 'neutral'>]>"
                    "<fontconfig><dir>&neutral; &amp; safe &#x3a9; &#x1d11e;</dir></fontconfig>";
  XML_Parser parser = XML_ParserCreate(NULL);
  if (argc != 2 || !parser || strcmp(XML_ExpatVersion(), argv[1])) return 1;
  for (int pass = 0; pass < 2; pass++) {
    if (pass && !XML_ParserReset(parser, NULL)) return 2;
    position = 0; elements = 0; invalid = 0;
    XML_SetElementHandler(parser, start, NULL);
    XML_SetCharacterDataHandler(parser, text);
    if (XML_Parse(parser, xml, (int)strlen(xml), 1) != XML_STATUS_OK) return 3;
    if (invalid || elements != 2 || position != sizeof(expected) / sizeof(expected[0]) - 1) return 4;
  }
  XML_ParserFree(parser);
  printf("%s XML_Char=%zu: code units/names/non-ASCII/surrogates/reset passed\n",
         XML_ExpatVersion(), sizeof(XML_Char));
  return 0;
}
