export const samples: Record<string, string> = {
  "Service interface": `package example.library;

import example.library.Book;

/** Library service · Data structure example */
interface ILibrary {
    const int PAGE_SIZE = 1 << 5;

    @nullable
    Book findBook(long id);

    List<Book> search(in String query, int limit);

    oneway void subscribe(in IListener listener);

    interface IListener {
        void onChanged(in Book book);
    }
}
`,
  "Data and expressions": `package example.library;

@JavaDerive(toString=true, equals=true)
parcelable Book {
    long id;
    String title = "Inside AIDL";
    @nullable String author;
    int[3] dimensions;
    List<String> tags;
    const int MASK = (1 << 4) | 3;
}
`,
  "Enums and unions": `package example.library;

union SearchResult {
    Book book;
    String error;
    int code;
}

@Backing(type="int")
enum Status {
    UNKNOWN = 0,
    READY = 1,
    FAILED = 2,
}
`,
  "Syntax diagnostics": `package example;

interface IBroken {
    void missingSemicolon()
}
`,
};
