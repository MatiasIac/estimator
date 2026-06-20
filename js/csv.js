(function attachCsv(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCsv(Estimator) {
  "use strict";

  var Core = Estimator.Core;

  function parseRows(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var source = String(text || "").replace(/^\uFEFF/, "");

    for (var index = 0; index < source.length; index += 1) {
      var char = source[index];
      var next = source[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(field);
        if (row.some(function hasValue(value) { return value.trim() !== ""; })) {
          rows.push(row);
        }
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some(function hasValue(value) { return value.trim() !== ""; })) {
      rows.push(row);
    }

    return rows;
  }

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function parseDependencies(value) {
    return String(value || "")
      .split(",")
      .map(Core.normalizeId)
      .filter(Boolean);
  }

  function storiesFromCsv(text) {
    var rows = parseRows(text);
    if (!rows.length) {
      return [];
    }

    var headers = rows[0].map(normalizeHeader);
    var indexByHeader = headers.reduce(function indexHeaders(map, header, index) {
      map[header] = index;
      return map;
    }, {});

    function value(row, header) {
      var index = indexByHeader[header];
      return index === undefined ? "" : row[index];
    }

    return rows.slice(1).map(function mapRow(row, index) {
      var o = Core.toNumber(value(row, "O"), 0);
      var m = Core.toNumber(value(row, "M"), o);
      var p = Core.toNumber(value(row, "P"), m);
      return Core.makeStory(
        {
          id: value(row, "ID"),
          name: value(row, "USER STORY"),
          o: o,
          m: m,
          p: p,
          estimation: value(row, "ESTIMATION") || Core.pertMean(o, m, p),
          dependencies: parseDependencies(value(row, "DEPENDENCY"))
        },
        index
      );
    });
  }

  function escapeField(value) {
    var stringValue = String(value === undefined || value === null ? "" : value);
    if (/[",\r\n]/.test(stringValue)) {
      return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    return stringValue;
  }

  function storiesToCsv(stories) {
    var headers = ["ID", "USER STORY", "O", "M", "P", "ESTIMATION", "DEPENDENCY"];
    var rows = stories.map(function mapStory(story) {
      var estimation = Core.round(Core.pertMean(story.o, story.m, story.p), 2);
      return [
        story.id,
        story.name,
        story.o,
        story.m,
        story.p,
        estimation,
        (story.dependencies || []).join(",")
      ].map(escapeField).join(",");
    });
    return [headers.join(",")].concat(rows).join("\n");
  }

  function validateStories(stories) {
    var errors = [];
    var ids = new Set();
    var byId = new Map();

    if (!stories.length) {
      return ["Upload or add at least one user story."];
    }

    stories.forEach(function validateStory(story, index) {
      var label = story.id || "row " + (index + 1);

      if (!story.id) {
        errors.push("Row " + (index + 1) + " is missing an ID.");
      }

      if (ids.has(story.id)) {
        errors.push("Duplicate story ID: " + story.id + ".");
      }
      ids.add(story.id);
      byId.set(story.id, story);

      if (!story.name) {
        errors.push(label + " is missing a user story name.");
      }

      ["o", "m", "p"].forEach(function validateNumber(field) {
        if (!Number.isFinite(Number(story[field]))) {
          errors.push(label + " has an invalid " + field.toUpperCase() + " value.");
        }
      });

      if (story.o < 0 || story.m < 0 || story.p < 0) {
        errors.push(label + " has a negative estimate.");
      }

      if (!(story.o <= story.m && story.m <= story.p)) {
        errors.push(label + " must satisfy O <= M <= P.");
      }
    });

    stories.forEach(function validateDependencies(story) {
      (story.dependencies || []).forEach(function validateDependency(dependency) {
        if (!byId.has(dependency)) {
          errors.push(story.id + " depends on unknown story " + dependency + ".");
        }
        if (dependency === story.id) {
          errors.push(story.id + " cannot depend on itself.");
        }
      });
    });

    return errors.concat(findCycleErrors(stories));
  }

  function findCycleErrors(stories) {
    var byId = new Map(stories.map(function pair(story) { return [story.id, story]; }));
    var state = new Map();
    var stack = [];
    var errors = [];

    function visit(story) {
      var status = state.get(story.id);
      if (status === "visiting") {
        var start = stack.indexOf(story.id);
        var cycle = stack.slice(start).concat(story.id).join(" -> ");
        errors.push("Dependency cycle detected: " + cycle + ".");
        return;
      }
      if (status === "visited") {
        return;
      }
      state.set(story.id, "visiting");
      stack.push(story.id);
      (story.dependencies || []).forEach(function visitDependency(dependency) {
        if (byId.has(dependency)) {
          visit(byId.get(dependency));
        }
      });
      stack.pop();
      state.set(story.id, "visited");
    }

    stories.forEach(visit);
    return errors;
  }

  Estimator.Csv = {
    parseRows: parseRows,
    storiesFromCsv: storiesFromCsv,
    storiesToCsv: storiesToCsv,
    validateStories: validateStories
  };

  return Estimator.Csv;
});
