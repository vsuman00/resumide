// Compiled once against installed u4 headers; reused with the candidate library.
#include <cassert>
#include <memory>
#include "GlobalParams.h"
#include "PDFDoc.h"
#include "TextOutputDev.h"
#include "goo/GooString.h"

int main(int argc, char **argv)
{
    assert(argc == 2);
    globalParams = std::make_unique<GlobalParams>();
    globalParams->setTextEncoding("UTF-8");
    PDFDoc doc(std::make_unique<GooString>(argv[1]));
    assert(doc.isOk() && doc.getNumPages() > 0);
    TextOutputDev text(nullptr, false, 0, false, false);
    assert(text.isOk());
    doc.displayPage(&text, 1, 72, 72, 0, true, false, false);
    auto words = text.makeWordList();
    assert(words && words->getLength() > 0);
    double left, top, right, bottom;
    words->get(0)->getBBox(&left, &top, &right, &bottom);
    std::unique_ptr<GooString> word(words->get(0)->getText());
    assert(word && word->getLength() > 0 && left <= right && top <= bottom);
}
