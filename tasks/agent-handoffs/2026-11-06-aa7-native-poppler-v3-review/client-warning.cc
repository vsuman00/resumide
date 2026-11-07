#include <vendor_fixture.hh>
static int own_probe(int own_unused_parameter) { return vendor_probe(1); }
int main() { return own_probe(3); }
