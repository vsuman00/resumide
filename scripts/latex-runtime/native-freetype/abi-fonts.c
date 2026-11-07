#include <assert.h>
#include <stdio.h>
#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_GLYPH_H

int main(int argc, char **argv) {
  assert(argc == 2);
  FT_Library library = NULL;
  FT_Face face = NULL;
  assert(FT_Init_FreeType(&library) == FT_Err_Ok);
  assert(FT_New_Face(library, argv[1], 0, &face) == FT_Err_Ok);
  assert(FT_Set_Char_Size(face, 0, 12 * 64, 72, 72) == FT_Err_Ok);
  printf("face %ld %ld %u %d %d\n", face->num_faces, face->num_glyphs, (unsigned)face->units_per_EM, face->ascender, face->descender);
  const FT_ULong codes[] = {0x41, 0x67, 0x65, 0x6e};
  for (unsigned i = 0; i < sizeof(codes) / sizeof(codes[0]); i++) {
    FT_UInt index = FT_Get_Char_Index(face, codes[i]);
    assert(index != 0);
    assert(FT_Load_Glyph(face, index, FT_LOAD_DEFAULT) == FT_Err_Ok);
    FT_Glyph glyph = NULL;
    FT_BBox bounds;
    assert(FT_Get_Glyph(face->glyph, &glyph) == FT_Err_Ok);
    FT_Glyph_Get_CBox(glyph, FT_GLYPH_BBOX_SUBPIXELS, &bounds);
    printf("glyph %lu %u %ld %ld %ld %ld %ld %ld\n", codes[i], index, face->glyph->advance.x, face->glyph->advance.y, bounds.xMin, bounds.yMin, bounds.xMax, bounds.yMax);
    FT_Done_Glyph(glyph);
  }
  assert(FT_Done_Face(face) == FT_Err_Ok);
  assert(FT_Done_FreeType(library) == FT_Err_Ok);
  return 0;
}
