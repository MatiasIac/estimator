(function attachMetrics(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createMetrics(Estimator) {
  "use strict";

  var Core = Estimator.Core;

  function getDuration(story, durationById) {
    if (durationById instanceof Map && durationById.has(story.id)) {
      return durationById.get(story.id);
    }
    if (durationById && Object.prototype.hasOwnProperty.call(durationById, story.id)) {
      return durationById[story.id];
    }
    return Core.pertMean(story.o, story.m, story.p);
  }

  function buildGraph(stories) {
    var byId = new Map();
    var indexById = new Map();
    var successors = new Map();
    var predecessors = new Map();

    stories.forEach(function setupStory(story, index) {
      byId.set(story.id, story);
      indexById.set(story.id, index);
      successors.set(story.id, []);
      predecessors.set(story.id, (story.dependencies || []).slice());
    });

    stories.forEach(function connectStory(story) {
      (story.dependencies || []).forEach(function addEdge(dependency) {
        if (successors.has(dependency)) {
          successors.get(dependency).push(story.id);
        }
      });
    });

    return {
      byId: byId,
      indexById: indexById,
      successors: successors,
      predecessors: predecessors
    };
  }

  function topologicalSort(stories) {
    var graph = buildGraph(stories);
    var indegree = new Map();
    var queue = [];
    var ordered = [];

    stories.forEach(function initialize(story) {
      var count = (story.dependencies || []).filter(function knownDependency(dependency) {
        return graph.byId.has(dependency);
      }).length;
      indegree.set(story.id, count);
      if (count === 0) {
        queue.push(story.id);
      }
    });

    queue.sort(function compareByInputOrder(a, b) {
      return graph.indexById.get(a) - graph.indexById.get(b);
    });

    while (queue.length) {
      var id = queue.shift();
      ordered.push(graph.byId.get(id));
      graph.successors.get(id).forEach(function release(successorId) {
        indegree.set(successorId, indegree.get(successorId) - 1);
        if (indegree.get(successorId) === 0) {
          queue.push(successorId);
          queue.sort(function compareByInputOrder(a, b) {
            return graph.indexById.get(a) - graph.indexById.get(b);
          });
        }
      });
    }

    if (ordered.length !== stories.length) {
      throw new Error("Dependency cycle detected. Resolve cycle errors before scheduling.");
    }

    return {
      order: ordered,
      graph: graph
    };
  }

  function calculateNetwork(stories, durationById) {
    var sorted = topologicalSort(stories);
    var graph = sorted.graph;
    var earlyStart = new Map();
    var earlyFinish = new Map();
    var predecessor = new Map();
    var lateStart = new Map();
    var lateFinish = new Map();
    var durationMap = new Map();
    var terminalId = "";
    var projectDuration = 0;

    sorted.order.forEach(function forwardPass(story) {
      var duration = Math.max(0, getDuration(story, durationById));
      var start = 0;
      var source = "";

      durationMap.set(story.id, duration);

      (story.dependencies || []).forEach(function inspectDependency(dependency) {
        if (!earlyFinish.has(dependency)) {
          return;
        }
        if (earlyFinish.get(dependency) >= start) {
          start = earlyFinish.get(dependency);
          source = dependency;
        }
      });

      earlyStart.set(story.id, start);
      earlyFinish.set(story.id, start + duration);
      predecessor.set(story.id, source);

      if (start + duration >= projectDuration) {
        projectDuration = start + duration;
        terminalId = story.id;
      }
    });

    sorted.order.slice().reverse().forEach(function backwardPass(story) {
      var successors = graph.successors.get(story.id) || [];
      var finish = projectDuration;

      if (successors.length) {
        finish = Math.min.apply(
          null,
          successors.map(function successorStart(successorId) {
            return lateStart.get(successorId);
          })
        );
      }

      lateFinish.set(story.id, finish);
      lateStart.set(story.id, finish - durationMap.get(story.id));
    });

    var criticalPath = [];
    var current = terminalId;
    while (current) {
      criticalPath.unshift(current);
      current = predecessor.get(current);
    }

    var tasks = sorted.order.map(function mapTask(story) {
      var slack = lateStart.get(story.id) - earlyStart.get(story.id);
      return {
        id: story.id,
        name: story.name,
        duration: durationMap.get(story.id),
        earliestStart: earlyStart.get(story.id),
        earliestFinish: earlyFinish.get(story.id),
        lateStart: lateStart.get(story.id),
        lateFinish: lateFinish.get(story.id),
        slack: slack,
        critical: Math.abs(slack) < 0.000001
      };
    });

    return {
      duration: projectDuration,
      criticalPath: criticalPath,
      tasks: tasks,
      order: sorted.order,
      graph: graph
    };
  }

  function calculateRanks(order, graph, durationById) {
    var ranks = new Map();
    order.slice().reverse().forEach(function rankStory(story) {
      var bestSuccessor = 0;
      (graph.successors.get(story.id) || []).forEach(function inspectSuccessor(successorId) {
        bestSuccessor = Math.max(bestSuccessor, ranks.get(successorId) || 0);
      });
      ranks.set(story.id, Math.max(0, getDuration(story, durationById)) + bestSuccessor);
    });
    return ranks;
  }

  function scheduleWithCapacity(stories, durationById, capacity) {
    if (!stories.length) {
      return { duration: 0, tasks: [] };
    }

    var workerCapacity = Math.max(1, Math.round(Core.toNumber(capacity, 1)));
    var sorted = topologicalSort(stories);
    var graph = sorted.graph;

    if (workerCapacity >= stories.length) {
      var network = calculateNetwork(stories, durationById);
      return {
        duration: network.duration,
        tasks: network.tasks.map(function networkTask(task) {
          return {
            id: task.id,
            name: task.name,
            start: task.earliestStart,
            end: task.earliestFinish,
            duration: task.duration
          };
        })
      };
    }

    var ranks = calculateRanks(sorted.order, graph, durationById);
    var remainingDependencies = new Map();
    var ready = [];
    var running = [];
    var completed = new Set();
    var scheduled = new Set();
    var taskTimes = new Map();
    var time = 0;
    var epsilon = 0.000001;

    sorted.order.forEach(function initialize(story) {
      var count = (story.dependencies || []).filter(function knownDependency(dependency) {
        return graph.byId.has(dependency);
      }).length;
      remainingDependencies.set(story.id, count);
      if (count === 0) {
        ready.push(story.id);
      }
    });

    function sortReady() {
      ready.sort(function compareReady(a, b) {
        var rankDiff = (ranks.get(b) || 0) - (ranks.get(a) || 0);
        if (Math.abs(rankDiff) > epsilon) {
          return rankDiff;
        }
        return graph.indexById.get(a) - graph.indexById.get(b);
      });
    }

    while (completed.size < stories.length) {
      sortReady();
      while (ready.length && running.length < workerCapacity) {
        var id = ready.shift();
        var story = graph.byId.get(id);
        var duration = Math.max(0, getDuration(story, durationById));
        scheduled.add(id);
        running.push({
          id: id,
          name: story.name,
          start: time,
          end: time + duration,
          duration: duration
        });
      }

      if (!running.length) {
        throw new Error("Unable to schedule stories. Check for dependency cycles.");
      }

      time = Math.min.apply(
        null,
        running.map(function endTime(task) { return task.end; })
      );

      var finished = running.filter(function finishedTask(task) {
        return task.end <= time + epsilon;
      });

      running = running.filter(function unfinishedTask(task) {
        return task.end > time + epsilon;
      });

      finished.forEach(function completeTask(task) {
        completed.add(task.id);
        taskTimes.set(task.id, task);
        (graph.successors.get(task.id) || []).forEach(function release(successorId) {
          remainingDependencies.set(successorId, remainingDependencies.get(successorId) - 1);
          if (remainingDependencies.get(successorId) === 0 && !scheduled.has(successorId)) {
            ready.push(successorId);
          }
        });
      });
    }

    return {
      duration: time,
      tasks: sorted.order.map(function orderedTask(story) {
        return taskTimes.get(story.id);
      })
    };
  }

  function deterministicDurationMap(stories) {
    return stories.reduce(function mapDuration(map, story) {
      map[story.id] = Core.pertMean(story.o, story.m, story.p);
      return map;
    }, {});
  }

  function summarizeDeterministic(stories, capacity) {
    var durations = deterministicDurationMap(stories);
    var network = calculateNetwork(stories, durations);
    var scheduled = scheduleWithCapacity(stories, durations, capacity);
    return {
      effort: Core.sum(stories.map(function storyEffort(story) {
        return durations[story.id];
      })),
      networkDuration: network.duration,
      scheduledDuration: scheduled.duration,
      criticalPath: network.criticalPath,
      tasks: network.tasks,
      scheduledTasks: scheduled.tasks
    };
  }

  Estimator.Metrics = {
    buildGraph: buildGraph,
    topologicalSort: topologicalSort,
    calculateNetwork: calculateNetwork,
    scheduleWithCapacity: scheduleWithCapacity,
    summarizeDeterministic: summarizeDeterministic,
    deterministicDurationMap: deterministicDurationMap
  };

  return Estimator.Metrics;
});
