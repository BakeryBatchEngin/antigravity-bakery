const fs = require('fs');
const file = 'src/app/production/page.tsx';
let c = fs.readFileSync(file, 'utf8');

const search = `                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}

              {/* === オーダー商品（Product Mixing）のリスト === */}`;

const replace = `                            </div>
                          </div>
                        </div>
                        
                        {/* 3段目: アクションエリア */}
                        <div className="flex items-center justify-start gap-2 pt-2 border-t border-amber-200 dark:border-amber-700/50">
                          {isExecuted && (
                            mixingExecutionTimes[batch.id] ? (
                              <div 
                                className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded shadow-inner border border-indigo-200 flex items-center gap-1 cursor-pointer hover:bg-indigo-100 transition-colors" 
                                onClick={(e) => { e.stopPropagation(); toggleMixingExecution(batch.id, true); }}
                                title="クリックで取り消し"
                              >
                                🔄 済 ({new Date(mixingExecutionTimes[batch.id]).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})
                              </div>
                            ) : (
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleMixingExecution(batch.id, false); }}
                                className="text-[10px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded shadow-md transition-colors"
                              >
                                ミキシング実行
                              </button>
                            )
                          )}
                        </div>

                      </div>
                    );
                  })}
                  </div>
                </div>
              )}

              {/* === オーダー商品（Product Mixing）のリスト === */}`;

if (c.includes(search)) {
  c = c.replace(search, replace);
} else {
  // Try line by line or LF
  const s2 = search.replace(/\r\n/g, '\n');
  if (c.includes(s2)) {
    c = c.replace(s2, replace);
  }
}

// Fix handleSetPlan newline issue
const searchPlan = `        body: JSON.stringify({\\n          date: targetDate,\\n          flatBatches: flatBatches,\\n          flatWipBatches: flatWipBatches,\\n          flatProductBatches: flatProductBatches\\n        })
      });`;
const replacePlan = `        body: JSON.stringify({
          date: targetDate,
          flatBatches: flatBatches,
          flatWipBatches: flatWipBatches,
          flatProductBatches: flatProductBatches
        })
      });`;
if(c.includes(searchPlan)) c = c.replace(searchPlan, replacePlan);
else if (c.includes(searchPlan.replace(/\r\n/g, '\n'))) c = c.replace(searchPlan.replace(/\r\n/g, '\n'), replacePlan);

fs.writeFileSync(file, c);
console.log('Successfully added WIP action area and fixed handleSetPlan!');
